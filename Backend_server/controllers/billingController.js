// Phase 5.7 — Billing self-service (ORG_ADMIN) + checkout
const Organization = require('../models/Organization');
const Invoice = require('../models/Invoice');
const OrganizationBillingEvent = require('../models/OrganizationBillingEvent');
const {
  getOrgQuotaSnapshot,
  refreshOrgBillingStatus
} = require('../utils/overQuotaLock');
const { getCurrentSubscription } = require('../services/subscriptionLifecycle');
const { createCheckoutSession } = require('../services/paymentCheckout');
const { getPlanPrice, getPlanPeriodDays } = require('../config/planPricing');
const {
  listPlans,
  DEFAULT_SEED,
  isPaidPlan,
  hasActivePaidPersonalPlan,
  getOrganizationPlanCodes,
  getPersonalPlanCodes,
  ensureDefaultPlans
} = require('../services/planCatalog');
const { getPersonalPlanLimits } = require('../utils/planQuota');
const { loginBankUser, chargeWalletDirect } = require('../services/bankWalletService');
const {
  createPersonalPayment,
  findActivePersonalPayment,
  getPersonalPaymentStatus,
  buildQrPayload
} = require('../services/personalPaymentService');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

/** GET /api/billing/plans — public catalog cho Landing (WL2), không cần auth */
async function listPublicPlans(req, res) {
  try {
    let plans = await listPlans({ activeOnly: true });
    if (!plans || !plans.length) {
      plans = DEFAULT_SEED.map((p) => ({ ...p, is_active: true }));
    }
    const publicPlans = plans
      .filter((p) => p.show_on_landing !== false)
      .map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description || '',
      price_vnd: Number(p.price_vnd) || 0,
      period_days: Number(p.period_days) || 30,
      max_buildings: p.max_buildings == null ? null : Number(p.max_buildings),
      max_users: p.max_users == null ? null : Number(p.max_users),
      features: Array.isArray(p.features) ? p.features : [],
      sort_order: Number(p.sort_order) || 0,
      is_personal: p.is_personal === true,
      is_organization: p.is_organization === true
    }));
    res.status(200).json({
      source: 'planCatalog',
      plans: publicPlans
    });
  } catch (e) {
    console.error('listPublicPlans:', e);
    res.status(500).json({ message: 'Không tải được bảng giá.' });
  }
}

async function resolveOrgForBilling(req, orgIdParam) {
  const role = req.user?.role;
  if (role === 'SUPER_ADMIN' && orgIdParam) {
    const org = await Organization.findById(orgIdParam);
    if (!org) return { error: { status: 404, message: 'Không tìm thấy tổ chức.' } };
    return { org };
  }
  if (role === 'ORG_ADMIN') {
    const oid = req.user.organization_id;
    if (!oid) {
      return { error: { status: 403, message: 'Tài khoản chưa gắn tổ chức.' } };
    }
    if (orgIdParam && String(orgIdParam) !== String(oid)) {
      return { error: { status: 403, message: 'Chỉ được xem billing tổ chức của bạn.' } };
    }
    const org = await Organization.findById(oid);
    if (!org) return { error: { status: 404, message: 'Không tìm thấy tổ chức.' } };
    return { org };
  }
  return { error: { status: 403, message: 'Không có quyền truy cập billing.' } };
}

// GET /api/billing/me
async function getMyBilling(req, res) {
  try {
    const { org, error } = await resolveOrgForBilling(req, req.query.organization_id);
    if (error) return res.status(error.status).json({ message: error.message });

    await refreshOrgBillingStatus(org);
    const subscription = await getCurrentSubscription(org._id);
    const quota = await getOrgQuotaSnapshot(org);
    const invoices = await Invoice.find({ organization_id: org._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const events = await OrganizationBillingEvent.find({ organization_id: org._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    res.json({
      organization: {
        _id: org._id,
        name: org.name,
        slug: org.slug,
        plan: org.plan,
        billing_status: org.billing_status,
        grace_ends_at: org.grace_ends_at,
        plan_started_at: org.plan_started_at,
        plan_expires_at: org.plan_expires_at
      },
      current_subscription: subscription,
      quota,
      invoices,
      billing_events: events
    });
  } catch (e) {
    console.error('getMyBilling:', e);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

// POST /api/billing/checkout
async function postCheckout(req, res) {
  try {
    const { org, error } = await resolveOrgForBilling(req, req.body?.organization_id);
    if (error) return res.status(error.status).json({ message: error.message });

    const plan = String(req.body?.plan || 'PRO').toUpperCase();
    const action = String(req.body?.action || 'upgrade').toLowerCase();
    const currentPlan = String(org.plan || 'FREE').toUpperCase();
    const currentPrice = getPlanPrice(currentPlan) || 0;
    const targetPrice = getPlanPrice(plan) || 0;

    // Gia hạn = cùng gói; nâng cấp = chỉ gói đắt hơn. Hạ gói không qua checkout tự phục vụ.
    if (action === 'renew') {
      if (plan !== currentPlan) {
        return res.status(400).json({
          message: 'Gia hạn phải đúng gói đang dùng. Muốn đổi gói hãy chọn nâng cấp.',
          code: 'RENEW_PLAN_MISMATCH'
        });
      }
    } else if (action === 'upgrade') {
      if (isPaidPlan(currentPlan) && !(targetPrice > currentPrice)) {
        return res.status(400).json({
          message:
            'Không thể thanh toán gói bằng hoặc thấp hơn gói hiện tại. Dùng «Gia hạn» cho cùng gói, hoặc liên hệ Super Admin nếu cần hạ gói.',
          code: 'DOWNGRADE_NOT_ALLOWED'
        });
      }
    }

    // Cho phép trang checkout gửi kèm thông tin liên hệ/hóa đơn → lưu vào tổ chức + hồ sơ user
    const contact = req.body?.contact || {};
    if (contact && typeof contact === 'object') {
      const cPhone = String(contact.phone || '').trim();
      const cAddress = String(contact.address || '').trim();
      const cCity = String(contact.city || '').trim();
      const cCountry = String(contact.country || '').trim();
      if (cPhone && /^0\d{9,10}$/.test(cPhone)) org.contact_phone = cPhone;
      if (cAddress) {
        org.contact_address = [cAddress, cCity, cCountry].filter(Boolean).join(', ');
      }
      if (org.isModified && org.isModified()) await org.save();
      try {
        const { saveUserBillingProfile } = require('../utils/userBillingProfile');
        await saveUserBillingProfile(req.user.userId, contact);
      } catch (e) {
        console.warn('saveUserBillingProfile org checkout:', e.message);
      }
    }

    // Phase 8.5 — KYC tối thiểu khi mua gói trả phí
    if (isPaidPlan(plan)) {
      const User = require('../models/User');
      const me = await User.findById(req.user.userId).select('phone').lean();
      const phone = String(org.contact_phone || me?.phone || '').trim();
      const address = String(org.contact_address || '').trim();
      if (!phone || address.length < 5) {
        return res.status(400).json({
          message:
            'Vui lòng bổ sung số điện thoại và địa chỉ tổ chức (≥5 ký tự) trước khi nâng cấp gói trả phí.',
          code: 'PROFILE_INCOMPLETE'
        });
      }
    }

    const session = await createCheckoutSession({
      org,
      plan,
      action,
      userId: req.user.userId,
      ipAddr: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    });

    logActivity({
      user_id: req.user.userId,
      action: 'CHECKOUT_START',
      target_type: 'invoice',
      target_id: String(session.invoice._id),
      target: session.invoice.invoice_number,
      details: {
        message: action === 'renew' ? 'Bắt đầu gia hạn gói' : 'Bắt đầu thanh toán nâng cấp gói',
        plan,
        action,
        amount: session.invoice.amount,
        provider: session.provider,
        organization_name: org.name
      },
      ip_address: req.ip || '',
      organization_id: org._id
    });

    res.status(201).json({
      message: 'Tạo phiên thanh toán thành công.',
      provider: session.provider,
      checkout_url: session.checkout_url,
      qr_data_url: session.qr_data_url || null,
      deep_link: session.deep_link || null,
      invoice_id: String(session.invoice._id),
      amount: session.invoice.amount,
      currency: session.invoice.currency,
      invoice: {
        _id: session.invoice._id,
        invoice_number: session.invoice.invoice_number,
        amount: session.invoice.amount,
        currency: session.invoice.currency,
        plan: session.invoice.plan,
        status: session.invoice.status
      }
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('postCheckout:', e);
    res.status(status).json({ message: e.message || 'Lỗi tạo checkout.' });
  }
}

// GET /api/billing/personal/me — REGISTERED_USER: gói cá nhân hiện tại + hạn mức
async function getPersonalBilling(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân dùng được.' });
    }
    const user = await User.findById(req.user.userId).select('plan plan_expires_at').lean();
    const plan = String(user?.plan || 'FREE').toUpperCase();
    const planActive = hasActivePaidPersonalPlan({ plan, plan_expires_at: user?.plan_expires_at });
    const currentPrice = planActive ? (getPlanPrice(plan) || 0) : 0;
    // Danh sách gói cá nhân trả phí từ catalog (data-driven — gói mới tự xuất hiện).
    // Khi đang dùng gói trả phí còn hạn: chỉ hiện gói hiện tại (gia hạn) + gói giá cao hơn (nâng cấp).
    const allPlans = await listPlans({ activeOnly: true });
    const availablePlans = allPlans
      .filter((p) => p.is_personal === true && (Number(p.price_vnd) || 0) > 0)
      .filter((p) => {
        const code = String(p.code).toUpperCase();
        const price = Number(p.price_vnd) || 0;
        if (!planActive || currentPrice <= 0) return true;
        if (code === plan) return true; // gia hạn
        return price > currentPrice; // chỉ nâng cấp lên gói đắt hơn
      })
      .map((p) => ({
        code: String(p.code).toUpperCase(),
        name: p.name || p.code,
        price_vnd: Number(p.price_vnd) || 0,
        period_days: Number(p.period_days) || 30,
        features: p.features || [],
        action: planActive && String(p.code).toUpperCase() === plan ? 'renew' : 'upgrade'
      }));
    const canCreateOrg = planActive;
    const orgPlans = allPlans
      .filter((p) => p.is_organization === true && (Number(p.price_vnd) || 0) > 0)
      .map((p) => ({
        code: String(p.code).toUpperCase(),
        name: p.name || p.code,
        price_vnd: Number(p.price_vnd) || 0
      }));
    return res.status(200).json({
      plan,
      plan_expires_at: user?.plan_expires_at || null,
      plan_active: planActive,
      plan_expired: Boolean(user?.plan_expires_at) && !planActive && plan !== 'FREE',
      current_price_vnd: currentPrice,
      // Hết hạn → áp hạn mức FREE cho đến khi gia hạn / mua gói mới
      limits: getPersonalPlanLimits(planActive ? plan : 'FREE'),
      effective_plan: planActive ? plan : 'FREE',
      pro_price_vnd: getPlanPrice('PRO'),
      pro_period_days: getPlanPeriodDays('PRO'),
      available_plans: availablePlans,
      can_create_org: canCreateOrg,
      organization_plans: orgPlans,
      create_org_lock_reason: canCreateOrg
        ? null
        : 'Nâng cấp gói cá nhân trả phí (vd. PRO) còn hiệu lực rồi mới tạo được tổ chức.',
      invoices: await listPersonalInvoicesForUser(req.user.userId)
    });
  } catch (e) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

async function listPersonalInvoicesForUser(userId) {
  const Invoice = require('../models/Invoice');
  const uid = String(userId || '');
  if (!uid) return [];
  const rows = await Invoice.find({
    status: { $in: ['PAID', 'OPEN', 'VOID'] },
    $or: [
      { 'metadata.user_id': uid },
      { 'metadata.user_id': userId },
      { created_by: userId, organization_id: null }
    ]
  })
    .sort({ paid_at: -1, createdAt: -1 })
    .limit(30)
    .select('invoice_number status plan amount currency paid_at createdAt note metadata')
    .lean();
  return rows.map((inv) => ({
    id: String(inv._id),
    invoice_number: inv.invoice_number,
    status: inv.status,
    plan: inv.plan || inv.metadata?.plan || '',
    amount: inv.amount || 0,
    currency: inv.currency || 'VND',
    paid_at: inv.paid_at || null,
    created_at: inv.createdAt || null,
    note: inv.note || ''
  }));
}

// POST /api/billing/personal/upgrade — REGISTERED_USER mua/gia hạn gói cá nhân qua ví TPTPbank
// Body: { plan: 'PRO'|mã catalog, months?, bankEmail|bankPhone, bankPassword }
async function personalUpgrade(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân được nâng cấp gói cá nhân.' });
    }
    const plan = String(req.body?.plan || 'PRO').toUpperCase();
    await ensureDefaultPlans();
    const personalCodes = getPersonalPlanCodes({ activeOnly: true, paidOnly: true });
    if (personalCodes.length && !personalCodes.includes(plan)) {
      return res.status(400).json({ message: 'Gói này không dành cho tài khoản cá nhân.' });
    }
    const me = await User.findById(req.user.userId).select('plan plan_expires_at').lean();
    const cur = String(me?.plan || 'FREE').toUpperCase();
    if (hasActivePaidPersonalPlan(me) && cur !== 'FREE' && cur !== plan) {
      const curPrice = getPlanPrice(cur) || 0;
      const nextPrice = getPlanPrice(plan) || 0;
      if (nextPrice < curPrice) {
        return res.status(400).json({
          message: `Bạn đang dùng gói ${cur} còn hiệu lực. Không thể chuyển sang gói thấp hơn (${plan}).`,
          code: 'PERSONAL_DOWNGRADE_BLOCKED'
        });
      }
    }
    const months = Math.max(1, Math.min(24, parseInt(req.body?.months, 10) || 1));
    const { bankEmail, bankPhone, bankPassword } = req.body || {};
    if ((!bankEmail && !bankPhone) || !bankPassword) {
      return res.status(400).json({ message: 'Cần đăng nhập ví TPTPbank (email/SĐT + mật khẩu) để thanh toán.' });
    }

    const unitPrice = getPlanPrice(plan);
    if (!unitPrice || unitPrice <= 0) {
      return res.status(400).json({ message: `Không xác định được giá gói ${plan}.` });
    }
    const total = unitPrice * months;

    // Đăng nhập ví TPTPbank
    let bankLogin;
    try {
      bankLogin = await loginBankUser({ email: bankEmail, phone: bankPhone, password: bankPassword });
    } catch (err) {
      return res.status(err.status || 401).json({ message: err.message || 'Đăng nhập ví thất bại.' });
    }
    const bankUserId = bankLogin.user.id;

    // Trừ ví trực tiếp (không tạo Invoice/Subscription org)
    const idem = `personal-${plan}-${req.user.userId}-${Date.now()}`;
    let charge;
    try {
      charge = await chargeWalletDirect({
        bankUserId,
        amount: total,
        description: `Nâng cấp ${plan} cá nhân (${months} tháng)`,
        idempotencyKey: idem
      });
    } catch (err) {
      return res.status(err.status || 400).json({ message: err.message, code: err.code });
    }

    // Ghi thẳng User.plan + gia hạn
    const user = await User.findById(req.user.userId);
    const periodDays = getPlanPeriodDays(plan) * months;
    const base = user.plan === plan && user.plan_expires_at && new Date(user.plan_expires_at) > new Date()
      ? new Date(user.plan_expires_at)
      : new Date();
    base.setDate(base.getDate() + periodDays);
    user.plan = plan;
    user.plan_expires_at = base;
    await user.save();

    logActivity({
      user_id: user._id,
      action: 'PERSONAL_PLAN_UPGRADE',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: { plan, months, amount: total, wallet_tx: String(charge.transaction?._id || '') },
      ip_address: req.ip || ''
    });

    return res.status(200).json({
      message: `Nâng cấp ${plan} thành công (${months} tháng)!`,
      plan,
      plan_expires_at: user.plan_expires_at,
      amount: total,
      wallet_balance: charge.wallet?.balance
    });
  } catch (e) {
    console.error('personalUpgrade:', e);
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + e.message });
  }
}

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[?::1\]?)(:\d+)?$/i;

function detectLanIp() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const ni of ifaces[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) candidates.push(ni.address);
    }
  }
  // Ưu tiên dải 192.168.*, rồi 10.*; tránh địa chỉ gateway/ảo kết thúc bằng .1
  candidates.sort((a, b) => {
    const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2) + (ip.endsWith('.1') ? 10 : 0);
    return score(a) - score(b);
  });
  return candidates[0] || null;
}

// Chọn base URL mà ĐIỆN THOẠI có thể truy cập (QR quét được).
// Bỏ qua PUBLIC_BASE_URL nếu nó là localhost; khi đó tự dò IP LAN.
function resolvePublicBaseUrl(req) {
  const pub = process.env.PUBLIC_BASE_URL ? process.env.PUBLIC_BASE_URL.replace(/\/$/, '') : '';
  const pubHost = pub.replace(/^https?:\/\//i, '');
  const pubIsLocal = pub && LOCAL_HOST_RE.test(pubHost);
  if (pub && !pubIsLocal) return pub;

  const proto = req.protocol || 'http';
  const reqHost = req.get('host') || `localhost:${process.env.PORT || 5000}`;
  // Nếu trình duyệt đã mở bằng IP LAN thì dùng luôn
  if (!LOCAL_HOST_RE.test(reqHost)) return `${proto}://${reqHost}`;

  const port = reqHost.includes(':') ? reqHost.split(':').pop() : (process.env.PORT || '5000');
  const lan = detectLanIp();
  return lan ? `${proto}://${lan}:${port}` : `${proto}://${reqHost}`;
}

// POST /api/billing/personal/checkout — tạo đơn thanh toán PRO + QR (REGISTERED_USER)
// Body: { plan:'PRO', months?, contact?{ full_name, company, address, city, country, phone } }
async function personalCheckout(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân được nâng cấp gói cá nhân.' });
    }
    const { plan = 'PRO', months = 1, contact = {}, purpose = 'UPGRADE', org_meta = {} } = req.body || {};
    const normPurpose = purpose === 'CREATE_ORG' ? 'CREATE_ORG' : 'UPGRADE';
    if (normPurpose === 'CREATE_ORG') {
      const meUser = await User.findById(req.user.userId).select('organization_id plan plan_expires_at').lean();
      if (meUser?.organization_id) {
        return res.status(400).json({ message: 'Tài khoản đã thuộc một tổ chức.', code: 'ALREADY_IN_ORG' });
      }
      if (!hasActivePaidPersonalPlan(meUser)) {
        return res.status(403).json({
          message: 'Cần nâng cấp gói cá nhân trả phí (vd. PRO) còn hiệu lực trước khi tạo tổ chức.',
          code: 'PERSONAL_PAID_REQUIRED'
        });
      }
      if (!String(org_meta?.name || '').trim() || String(org_meta.name).trim().length < 2) {
        return res.status(400).json({ message: 'Tên tổ chức phải có ít nhất 2 ký tự.', code: 'ORG_NAME_REQUIRED', field: 'org_name' });
      }
      const orgCodes = getOrganizationPlanCodes({ activeOnly: true, paidOnly: true });
      const wantPlan = String(plan || 'BUSINESS').toUpperCase();
      if (orgCodes.length && !orgCodes.includes(wantPlan)) {
        return res.status(400).json({
          message: 'Gói này không dành cho tổ chức. Chọn gói được đánh dấu «Tổ chức» trong catalog.',
          code: 'NOT_ORG_PLAN'
        });
      }
    }

    // Bắt buộc thông tin liên hệ/hóa đơn (công ty được phép để trống)
    const required = {
      full_name: 'họ tên',
      address: 'địa chỉ',
      city: 'thành phố',
      country: 'quốc gia',
      phone: 'số điện thoại'
    };
    for (const [key, label] of Object.entries(required)) {
      if (!String(contact?.[key] || '').trim()) {
        return res.status(400).json({ message: `Vui lòng nhập ${label}.`, code: 'CONTACT_INCOMPLETE', field: key });
      }
    }

    // Ràng buộc định dạng
    const fullName = String(contact.full_name).trim();
    const phone = String(contact.phone).trim();
    const address = String(contact.address).trim();
    const city = String(contact.city).trim();
    if (/\d/.test(fullName) || fullName.length < 2) {
      return res.status(400).json({ message: 'Họ và tên không hợp lệ (chỉ gồm chữ, tối thiểu 2 ký tự).', code: 'INVALID_NAME', field: 'full_name' });
    }
    if (!/^0\d{9,10}$/.test(phone)) {
      return res.status(400).json({ message: 'Số điện thoại không hợp lệ (10–11 chữ số, bắt đầu bằng 0).', code: 'INVALID_PHONE', field: 'phone' });
    }
    if (address.length < 5) {
      return res.status(400).json({ message: 'Địa chỉ quá ngắn (tối thiểu 5 ký tự).', code: 'INVALID_ADDRESS', field: 'address' });
    }
    if (city.length < 2 || /\d/.test(city)) {
      return res.status(400).json({ message: 'Thành phố không hợp lệ (chỉ gồm chữ, tối thiểu 2 ký tự).', code: 'INVALID_CITY', field: 'city' });
    }

    const baseUrl = resolvePublicBaseUrl(req);
    const { payment, payUrl, qrDataUrl, alreadyPaid } = await createPersonalPayment({
      userId: req.user.userId,
      plan,
      months,
      contact,
      baseUrl,
      purpose: normPurpose,
      orgMeta: org_meta
    });
    // Lưu hồ sơ thanh toán trên user để lần sau tự điền
    try {
      const { saveUserBillingProfile } = require('../utils/userBillingProfile');
      await saveUserBillingProfile(req.user.userId, contact);
    } catch (e) {
      console.warn('saveUserBillingProfile personal checkout:', e.message);
    }
    return res.status(alreadyPaid ? 200 : 201).json({
      payment_id: String(payment._id),
      token: payment.token,
      amount: payment.amount,
      currency: payment.currency,
      months: payment.months,
      plan: payment.plan,
      status: payment.status,
      already_paid: alreadyPaid === true,
      plan_expires_at: alreadyPaid ? (await User.findById(req.user.userId).select('plan_expires_at').lean())?.plan_expires_at || null : null,
      expires_at: payment.expires_at,
      pay_url: payUrl,
      qr_data_url: qrDataUrl
    });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Lỗi tạo đơn thanh toán.' });
  }
}

// GET /api/billing/personal/checkout/active — đơn PENDING đang mở (F5 khôi phục QR)
async function personalCheckoutActive(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân dùng được.' });
    }
    const purpose = req.query.purpose === 'CREATE_ORG' ? 'CREATE_ORG' : 'UPGRADE';
    const plan = req.query.plan ? String(req.query.plan).toUpperCase() : null;
    const payment = await findActivePersonalPayment(req.user.userId, { purpose, plan });
    if (!payment) {
      return res.status(200).json({ active: false });
    }
    const baseUrl = resolvePublicBaseUrl(req);
    const { payUrl, qrDataUrl } = await buildQrPayload(payment, baseUrl);
    return res.status(200).json({
      active: true,
      payment_id: String(payment._id),
      token: payment.token,
      amount: payment.amount,
      currency: payment.currency,
      months: payment.months,
      plan: payment.plan,
      status: payment.status,
      expires_at: payment.expires_at,
      pay_url: payUrl,
      qr_data_url: qrDataUrl
    });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Lỗi tải đơn thanh toán.' });
  }
}

// GET /api/billing/checkout/:invoiceId/status — poll trạng thái hóa đơn tổ chức
async function getCheckoutStatus(req, res) {
  try {
    const invoice = await Invoice.findById(req.params.invoiceId).lean();
    if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    // Chỉ SUPER_ADMIN hoặc ORG_ADMIN của chính tổ chức được xem
    const role = req.user?.role;
    if (role !== 'SUPER_ADMIN' &&
        !(role === 'ORG_ADMIN' && String(req.user.organization_id) === String(invoice.organization_id))) {
      return res.status(403).json({ message: 'Không có quyền xem hóa đơn này.' });
    }
    const out = { status: invoice.status, invoice_status: invoice.status };
    if (invoice.status === 'PAID') {
      const org = await Organization.findById(invoice.organization_id).select('plan plan_expires_at').lean();
      out.plan = org?.plan || invoice.plan;
      out.plan_expires_at = org?.plan_expires_at || null;
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// GET /api/billing/personal/checkout/:id/status?token=... — poll trạng thái
async function personalCheckoutStatus(req, res) {
  try {
    if (!req.user || req.user.role !== 'REGISTERED_USER') {
      return res.status(403).json({ message: 'Chỉ tài khoản cá nhân dùng được.' });
    }
    const out = await getPersonalPaymentStatus(req.params.id, req.query.token || '');
    // Tạo tổ chức xong → cấp phiên mới (role ORG_ADMIN) để frontend chuyển chế độ ngay
    if (out.status === 'PAID' && out.purpose === 'CREATE_ORG' && out.organization) {
      const user = await User.findById(req.user.userId);
      if (user && user.role === 'ORG_ADMIN') {
        user.session_version = (Number(user.session_version) || 0) + 1;
        await user.save();
        const { issueAuthSession } = require('./authController');
        const session = await issueAuthSession(user, req);
        out.reauth = true;
        out.token = session.token;
        out.refreshToken = session.refreshToken;
        out.user = { id: user._id, email: user.email, role: user.role, organization_id: user.organization_id };
      }
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
}

module.exports = {
  listPublicPlans,
  getMyBilling,
  postCheckout,
  resolveOrgForBilling,
  getPersonalBilling,
  personalUpgrade,
  personalCheckout,
  personalCheckoutActive,
  personalCheckoutStatus,
  getCheckoutStatus
};
