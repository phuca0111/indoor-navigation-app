// Thanh toán gói cá nhân (REGISTERED_USER) qua QR — quét bằng điện thoại, xác nhận trên trang ví.
const crypto = require('crypto');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const PersonalPayment = require('../models/PersonalPayment');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const ActivityLog = require('../models/ActivityLog');
const { getPlanPrice, getPlanPeriodDays } = require('../config/planPricing');
const { chargeWalletDirect } = require('./bankWalletService');
const { getBaseUrl } = require('./vnpayService');

const MERCHANT_NAME = 'Indoor Nav SaaS';
const PAYMENT_TTL_MS = 15 * 60 * 1000; // 15 phút
const RECENT_PAID_WINDOW_MS = 3 * 60 * 1000; // chặn tạo QR mới ngay sau khi vừa PAID

function buildPersonalPayUrl(paymentId, token, baseUrl) {
  const base = (baseUrl || getBaseUrl()).replace(/\/$/, '');
  return `${base}/tptp-pay/personal/${paymentId}?token=${encodeURIComponent(token)}`;
}

// Deep link cho app TPTPbank quét (dùng lại schema hóa đơn: invoiceId=<paymentId>)
function buildPersonalDeepLink(paymentId, token) {
  return `tptpbank://pay?invoiceId=${encodeURIComponent(paymentId)}&token=${encodeURIComponent(token)}`;
}

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (mongoose.Types.ObjectId.isValid(String(id))) return new mongoose.Types.ObjectId(String(id));
  return null;
}

async function cancelPendingForUser(userId, { exceptId = null } = {}) {
  const uid = toObjectId(userId);
  if (!uid) return;
  const filter = {
    user_id: uid,
    status: { $in: ['PENDING', 'PROCESSING'] }
  };
  if (exceptId) filter._id = { $ne: toObjectId(exceptId) };
  await PersonalPayment.updateMany(filter, { $set: { status: 'CANCELLED' } });
}

async function buildQrPayload(payment, baseUrl) {
  const payUrl = buildPersonalPayUrl(payment._id, payment.token, baseUrl);
  const deepLink = buildPersonalDeepLink(payment._id, payment.token);
  const qrDataUrl = await QRCode.toDataURL(deepLink, { width: 260, margin: 1, errorCorrectionLevel: 'M' });
  return { payment, payUrl, deepLink, qrDataUrl, alreadyPaid: payment.status === 'PAID' };
}

/**
 * Tìm đơn PENDING còn hạn của user (để F5 khôi phục đúng QR đang mở trên điện thoại).
 */
async function findActivePersonalPayment(userId, { purpose = 'UPGRADE', plan = null } = {}) {
  const uid = toObjectId(userId);
  if (!uid) return null;
  const normPurpose = purpose === 'CREATE_ORG' ? 'CREATE_ORG' : 'UPGRADE';
  const filter = {
    user_id: uid,
    status: 'PENDING',
    purpose: normPurpose,
    expires_at: { $gt: new Date() }
  };
  if (plan) filter.plan = String(plan).toUpperCase();
  return PersonalPayment.findOne(filter).sort({ createdAt: -1 });
}

/**
 * Tạo đơn thanh toán PRO cá nhân + sinh QR (data URL) trỏ tới trang xác nhận trên điện thoại.
 * baseUrl: nên là host mà điện thoại truy cập được (LAN IP), lấy từ request.
 *
 * Quan trọng: tái sử dụng đơn PENDING cùng gói thay vì tạo mã mới — tránh F5/bấm lại
 * làm lệch QR web vs màn hình điện thoại → trừ tiền 2 lần.
 */
async function createPersonalPayment({ userId, plan = 'PRO', months = 1, contact = {}, baseUrl = '', purpose = 'UPGRADE', orgMeta = {} }) {
  const uid = toObjectId(userId);
  if (!uid) {
    throw Object.assign(new Error('userId không hợp lệ.'), { status: 400 });
  }

  const normPurpose = purpose === 'CREATE_ORG' ? 'CREATE_ORG' : 'UPGRADE';
  let normPlan = String(plan || 'PRO').toUpperCase();
  let m = Math.max(1, Math.min(24, parseInt(months, 10) || 1));

  if (normPurpose === 'CREATE_ORG') {
    const { getOrganizationPlanCodes, ensureDefaultPlans } = require('./planCatalog');
    await ensureDefaultPlans();
    const orgCodes = getOrganizationPlanCodes({ activeOnly: true, paidOnly: true });
    if (!normPlan || normPlan === 'PRO') normPlan = orgCodes[0] || 'BUSINESS';
    if (orgCodes.length && !orgCodes.includes(normPlan)) {
      throw Object.assign(
        new Error('Tạo tổ chức chỉ hỗ trợ các gói được đánh dấu dành cho Tổ chức trong catalog.'),
        { status: 400 }
      );
    }
    m = 1; // gói tổ chức tính theo kỳ của gói
    if (!String(orgMeta?.name || '').trim()) {
      throw Object.assign(new Error('Vui lòng nhập tên tổ chức.'), { status: 400 });
    }
  } else {
    // UPGRADE cá nhân: chỉ chấp nhận gói đánh dấu is_personal
    const { getPersonalPlanCodes, ensureDefaultPlans, getPlanPrice: catalogPrice, hasActivePaidPersonalPlan } = require('./planCatalog');
    await ensureDefaultPlans();
    const personalCodes = getPersonalPlanCodes({ activeOnly: true, paidOnly: true });
    if (personalCodes.length && !personalCodes.includes(normPlan)) {
      throw Object.assign(
        new Error('Gói này không dành cho tài khoản cá nhân.'),
        { status: 400 }
      );
    }
    // Chặn hạ cấp khi gói hiện tại còn hiệu lực (chỉ gia hạn cùng gói hoặc nâng lên gói đắt hơn)
    const me = await User.findById(uid).select('plan plan_expires_at').lean();
    const cur = String(me?.plan || 'FREE').toUpperCase();
    if (hasActivePaidPersonalPlan(me) && cur !== 'FREE' && cur !== normPlan) {
      const curPrice = catalogPrice(cur) || 0;
      const nextPrice = catalogPrice(normPlan) || 0;
      if (nextPrice < curPrice) {
        throw Object.assign(
          new Error(
            `Bạn đang dùng gói ${cur} còn hiệu lực. Không thể chuyển sang gói thấp hơn (${normPlan}). ` +
            'Hãy gia hạn gói hiện tại hoặc chọn gói có giá cao hơn.'
          ),
          { status: 400, code: 'PERSONAL_DOWNGRADE_BLOCKED' }
        );
      }
    }
  }

  const unit = getPlanPrice(normPlan);
  const amount = unit * m;
  if (!amount || amount <= 0) {
    throw Object.assign(new Error(`Không xác định được giá gói ${normPlan}.`), { status: 400 });
  }

  // Vừa thanh toán xong vài phút trước → trả lại đơn PAID (frontend hiện success, không tạo QR mới)
  const recentPaid = await PersonalPayment.findOne({
    user_id: uid,
    status: 'PAID',
    purpose: normPurpose,
    plan: normPlan,
    months: m,
    paid_at: { $gte: new Date(Date.now() - RECENT_PAID_WINDOW_MS) }
  }).sort({ paid_at: -1 });
  if (recentPaid) {
    return buildQrPayload(recentPaid, baseUrl);
  }

  // Tái sử dụng PENDING cùng gói/kỳ hạn còn hạn (F5 / bấm Thanh toán lại)
  const existing = await PersonalPayment.findOne({
    user_id: uid,
    status: 'PENDING',
    purpose: normPurpose,
    plan: normPlan,
    months: m,
    expires_at: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  if (existing) {
    // Hủy mọi PENDING khác (gói khác / đơn cũ lệch)
    await cancelPendingForUser(uid, { exceptId: existing._id });
    existing.expires_at = new Date(Date.now() + PAYMENT_TTL_MS);
    existing.contact = {
      full_name: String(contact.full_name || existing.contact?.full_name || '').trim(),
      company: String(contact.company || existing.contact?.company || '').trim(),
      address: String(contact.address || existing.contact?.address || '').trim(),
      city: String(contact.city || existing.contact?.city || '').trim(),
      country: String(contact.country || existing.contact?.country || '').trim(),
      phone: String(contact.phone || existing.contact?.phone || '').trim()
    };
    if (normPurpose === 'CREATE_ORG') {
      existing.org_meta = {
        name: String(orgMeta.name || existing.org_meta?.name || '').trim(),
        slug: String(orgMeta.slug || existing.org_meta?.slug || '').trim()
      };
    }
    await existing.save();
    return buildQrPayload(existing, baseUrl);
  }

  // Không còn PENDING phù hợp → hủy toàn bộ PENDING/PROCESSING cũ rồi tạo mới
  await cancelPendingForUser(uid);

  const token = crypto.randomBytes(24).toString('hex');
  const payment = await PersonalPayment.create({
    user_id: uid,
    plan: normPlan,
    months: m,
    amount,
    currency: 'VND',
    status: 'PENDING',
    purpose: normPurpose,
    org_meta: normPurpose === 'CREATE_ORG'
      ? { name: String(orgMeta.name || '').trim(), slug: String(orgMeta.slug || '').trim() }
      : { name: '', slug: '' },
    token,
    expires_at: new Date(Date.now() + PAYMENT_TTL_MS),
    contact: {
      full_name: String(contact.full_name || '').trim(),
      company: String(contact.company || '').trim(),
      address: String(contact.address || '').trim(),
      city: String(contact.city || '').trim(),
      country: String(contact.country || '').trim(),
      phone: String(contact.phone || '').trim()
    }
  });

  return buildQrPayload(payment, baseUrl);
}

async function findValidPayment(paymentId, token) {
  const payment = await PersonalPayment.findById(paymentId);
  if (!payment) throw Object.assign(new Error('Không tìm thấy đơn thanh toán.'), { status: 404 });
  if (payment.token !== token) {
    throw Object.assign(new Error('Token thanh toán không hợp lệ.'), { status: 403 });
  }
  return payment;
}

async function expireIfNeeded(payment) {
  if (payment.status === 'PENDING' && payment.expires_at && payment.expires_at.getTime() < Date.now()) {
    payment.status = 'EXPIRED';
    await payment.save();
  }
  return payment;
}

/** Kiểm tra một ID có phải đơn thanh toán cá nhân không (để phân luồng ở app/bank). */
async function isPersonalPayment(id) {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) return false;
    const exists = await PersonalPayment.exists({ _id: id });
    return !!exists;
  } catch (_) {
    return false;
  }
}

/** Map thông tin đơn cá nhân sang shape mà app TPTPbank (PaymentResolveResponse) mong đợi. */
async function resolvePersonalPaymentForApp(paymentId, token) {
  const info = await resolvePersonalPayment(paymentId, token);
  const label = info.purpose === 'CREATE_ORG'
    ? `Tạo tổ chức · ${info.plan}`
    : `${info.plan} · ${info.months} tháng`;
  return {
    invoice_id: info.payment_id,
    invoice_number: label,
    amount: info.amount,
    currency: info.currency,
    plan: info.plan,
    merchant: info.merchant,
    status: info.status,
    payment_token: token
  };
}

/** Trả thông tin đơn để hiển thị trên trang xác nhận (không cần đăng nhập ví). */
async function resolvePersonalPayment(paymentId, token) {
  let payment = await findValidPayment(paymentId, token);
  payment = await expireIfNeeded(payment);
  return {
    payment_id: String(payment._id),
    amount: payment.amount,
    currency: payment.currency || 'VND',
    plan: payment.plan,
    months: payment.months,
    purpose: payment.purpose || 'UPGRADE',
    merchant: MERCHANT_NAME,
    status: payment.status
  };
}

/** Chỉ trả trạng thái — dùng để trang checkout poll. */
async function getPersonalPaymentStatus(paymentId, token) {
  let payment = await findValidPayment(paymentId, token);
  payment = await expireIfNeeded(payment);
  const out = { status: payment.status, purpose: payment.purpose || 'UPGRADE' };
  if (payment.status === 'PAID') {
    if (payment.purpose === 'CREATE_ORG' && payment.org_id_created) {
      const Organization = require('../models/Organization');
      const org = await Organization.findById(payment.org_id_created).select('name slug plan plan_expires_at').lean();
      if (org) {
        out.organization = { _id: String(org._id), name: org.name, slug: org.slug, plan: org.plan };
        out.plan_expires_at = org.plan_expires_at || null;
      }
    } else {
      const user = await User.findById(payment.user_id).select('plan_expires_at').lean();
      out.plan_expires_at = user?.plan_expires_at || null;
    }
  }
  return out;
}

/**
 * Ghi nhận doanh thu nâng cấp PRO cá nhân vào Invoice (organization_id = null),
 * để hiển thị đồng nhất trên biểu đồ Thu/Chi, tab Tài chính và xuất CSV.
 * Idempotent theo external_ref = PERSONAL-<paymentId>.
 */
async function createPersonalUpgradeInvoice(payment, user) {
  const planCode = String(payment.plan || 'PRO').toUpperCase();
  const externalRef = `PERSONAL-${payment._id}`;
  const existing = await Invoice.findOne({ external_ref: externalRef }).lean();
  if (existing) return existing;

  const paidAt = payment.paid_at || new Date();
  const months = payment.months || 1;
  const periodDays = getPlanPeriodDays(planCode) * months;
  const periodEnd = new Date(paidAt);
  periodEnd.setDate(periodEnd.getDate() + periodDays);

  return Invoice.create({
    organization_id: null,
    invoice_number: `PP-${String(user._id).slice(-6)}-${payment._id}`,
    status: 'PAID',
    plan: planCode,
    amount: payment.amount || 0,
    currency: payment.currency || 'VND',
    period_start: paidAt,
    period_end: periodEnd,
    paid_at: paidAt,
    external_ref: externalRef,
    idempotency_key: externalRef,
    note: `Nâng cấp ${planCode} cá nhân (${months} tháng)`,
    metadata: {
      source: 'PERSONAL_UPGRADE',
      scope: 'personal',
      payment_id: String(payment._id),
      user_id: String(user._id),
      user_email: user.email || ''
    },
    created_by: user._id
  });
}

/**
 * Xác nhận thanh toán từ phía ví (bank user đã đăng nhập).
 * UPGRADE → nâng cấp User.plan; CREATE_ORG → tạo tổ chức + đưa user thành ORG_ADMIN.
 */
async function confirmPersonalPayment({ bankUserId, paymentId, token }) {
  // Claim atomic: chỉ 1 lần confirm được trừ tiền; đơn CANCELLED/PAID/EXPIRED bị từ chối trước khi charge
  const claimed = await PersonalPayment.findOneAndUpdate(
    { _id: paymentId, token, status: 'PENDING' },
    { $set: { status: 'PROCESSING' } },
    { returnDocument: 'after' }
  );

  if (!claimed) {
    const payment = await findValidPayment(paymentId, token);
    const planCode = String(payment.plan || 'PRO').toUpperCase();
    const purpose = payment.purpose || 'UPGRADE';
    if (payment.status === 'PAID') {
      return { duplicated: true, amount: payment.amount, plan: planCode, purpose };
    }
    if (payment.status === 'PROCESSING') {
      throw Object.assign(
        new Error('Đơn đang được xử lý. Vui lòng đợi vài giây.'),
        { status: 409, code: 'PAYMENT_PROCESSING' }
      );
    }
    if (payment.status === 'CANCELLED') {
      throw Object.assign(
        new Error('Mã QR này đã bị thay bằng mã mới. Vui lòng quét lại QR trên web.'),
        { status: 400, code: 'PAYMENT_SUPERSEDED' }
      );
    }
    throw Object.assign(new Error('Đơn thanh toán đã hết hạn hoặc bị hủy.'), { status: 400, code: 'PAYMENT_NOT_PENDING' });
  }

  let payment = claimed;
  if (payment.expires_at && payment.expires_at.getTime() < Date.now()) {
    payment.status = 'EXPIRED';
    await payment.save();
    throw Object.assign(new Error('Đơn thanh toán đã hết hạn hoặc bị hủy.'), { status: 400, code: 'PAYMENT_NOT_PENDING' });
  }

  const planCode = String(payment.plan || 'PRO').toUpperCase();
  const purpose = payment.purpose || 'UPGRADE';

  const user = await User.findById(payment.user_id);
  if (!user) {
    payment.status = 'CANCELLED';
    await payment.save().catch(() => {});
    throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404 });
  }

  const releaseClaim = async () => {
    try {
      if (payment.status === 'PROCESSING') {
        payment.status = 'PENDING';
        await payment.save();
      }
    } catch (_) {}
  };

  // ===== CREATE_ORG: tạo tổ chức trả phí =====
  if (purpose === 'CREATE_ORG') {
    if (user.organization_id) {
      await releaseClaim();
      throw Object.assign(new Error('Tài khoản đã thuộc một tổ chức.'), { status: 400, code: 'ALREADY_IN_ORG' });
    }
    let charge;
    try {
      charge = await chargeWalletDirect({
        bankUserId,
        amount: payment.amount,
        description: `Tạo tổ chức gói ${planCode}`,
        idempotencyKey: `personal-pay-${payment._id}`
      });
    } catch (err) {
      await releaseClaim();
      throw err;
    }

    const { createOrgForUserCore } = require('../controllers/organizationController');
    const { org } = await createOrgForUserCore(user, {
      name: payment.org_meta?.name,
      slug: payment.org_meta?.slug,
      plan: planCode,
      activatePaid: false,
      source: 'PAID_CHECKOUT',
      ip: ''
    });

    try {
      const { activateOrRenewSubscription } = require('./subscriptionLifecycle');
      await activateOrRenewSubscription({
        org,
        plan: planCode,
        amount: payment.amount,
        currency: payment.currency || 'VND',
        provider: 'TPTPPAY',
        externalRef: `TPTP-personal-${payment._id}`,
        idempotencyKey: `create-org-${payment._id}`,
        note: 'Tạo tổ chức + kích hoạt gói qua ví TPTPbank',
        createdBy: user._id,
        metadata: { source: 'CREATE_ORG_QR', payment_id: String(payment._id), provider: 'TPTPPAY' }
      });
    } catch (subErr) {
      console.error('createOrg activateSubscription:', subErr.message);
    }

    payment.status = 'PAID';
    payment.paid_at = new Date();
    payment.bank_user_id = bankUserId;
    payment.bank_tx_id = charge.transaction?._id || null;
    payment.org_id_created = org._id;
    await payment.save();

    try {
      const { saveUserBillingProfile } = require('../utils/userBillingProfile');
      await saveUserBillingProfile(user._id, payment.contact || {});
    } catch (e) {
      console.warn('saveUserBillingProfile on CREATE_ORG PAID:', e.message);
    }

    return {
      duplicated: false,
      amount: payment.amount,
      plan: planCode,
      purpose,
      organization: { _id: String(org._id), name: org.name, slug: org.slug, plan: org.plan },
      wallet_balance: charge.wallet?.balance
    };
  }

  // ===== UPGRADE: nâng cấp gói cá nhân =====
  // Chặn hạ cấp nếu user đã đổi sang gói cao hơn sau khi tạo QR
  {
    const { getPlanPrice: catalogPrice, hasActivePaidPersonalPlan } = require('./planCatalog');
    const cur = String(user.plan || 'FREE').toUpperCase();
    if (hasActivePaidPersonalPlan(user) && cur !== 'FREE' && cur !== planCode) {
      const curPrice = catalogPrice(cur) || 0;
      const nextPrice = catalogPrice(planCode) || 0;
      if (nextPrice < curPrice) {
        payment.status = 'CANCELLED';
        await payment.save().catch(() => {});
        throw Object.assign(
          new Error(
            `Bạn đang dùng gói ${cur} còn hiệu lực. Không thể thanh toán gói thấp hơn (${planCode}). Quét lại QR gia hạn/nâng cấp.`
          ),
          { status: 400, code: 'PERSONAL_DOWNGRADE_BLOCKED' }
        );
      }
    }
  }

  let charge;
  try {
    charge = await chargeWalletDirect({
      bankUserId,
      amount: payment.amount,
      description: `Nâng cấp ${planCode} cá nhân (${payment.months} tháng)`,
      idempotencyKey: `personal-pay-${payment._id}`
    });
  } catch (err) {
    await releaseClaim();
    throw err;
  }

  try {
    const periodDays = getPlanPeriodDays(planCode) * payment.months;
    const base = user.plan === planCode && user.plan_expires_at && new Date(user.plan_expires_at) > new Date()
      ? new Date(user.plan_expires_at)
      : new Date();
    base.setDate(base.getDate() + periodDays);
    user.plan = planCode;
    user.plan_expires_at = base;
    await user.save();

    payment.status = 'PAID';
    payment.paid_at = new Date();
    payment.bank_user_id = bankUserId;
    payment.bank_tx_id = charge.transaction?._id || null;
    await payment.save();
  } catch (err) {
    console.error('confirmPersonalPayment fulfill failed after charge:', err.message);
    // Đã trừ tiền — cố ghi nhận PAID để không mất gói; invoice có thể tạo sau
    payment.status = 'PAID';
    payment.paid_at = payment.paid_at || new Date();
    payment.bank_user_id = bankUserId;
    payment.bank_tx_id = charge.transaction?._id || null;
    await payment.save().catch(() => {});
    throw err;
  }

  try {
    const { saveUserBillingProfile } = require('../utils/userBillingProfile');
    await saveUserBillingProfile(user._id, payment.contact || {});
  } catch (e) {
    console.warn('saveUserBillingProfile on personal PAID:', e.message);
  }

  try {
    await createPersonalUpgradeInvoice(payment, user);
  } catch (invErr) {
    console.error('personal upgrade invoice:', invErr.message);
  }

  ActivityLog.create({
    user_id: user._id,
    action: 'PERSONAL_PLAN_UPGRADE',
    target_type: 'user',
    target_id: String(user._id),
    target: user.email,
    details: {
      plan: planCode,
      months: payment.months,
      amount: payment.amount,
      via: 'QR',
      payment_id: String(payment._id),
      wallet_tx: String(charge.transaction?._id || '')
    },
    ip_address: ''
  }).catch(() => {});

  return {
    duplicated: false,
    amount: payment.amount,
    plan: planCode,
    purpose,
    plan_expires_at: user.plan_expires_at,
    wallet_balance: charge.wallet?.balance
  };
}

module.exports = {
  MERCHANT_NAME,
  createPersonalPayment,
  findActivePersonalPayment,
  resolvePersonalPayment,
  resolvePersonalPaymentForApp,
  isPersonalPayment,
  getPersonalPaymentStatus,
  confirmPersonalPayment,
  createPersonalUpgradeInvoice,
  buildQrPayload
};
