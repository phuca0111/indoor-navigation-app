// Thanh toán gói cá nhân (REGISTERED_USER) qua QR — quét bằng điện thoại, xác nhận trên trang ví.
const crypto = require('crypto');
const QRCode = require('qrcode');
const personalPaymentRepository = require('../repositories/personalPaymentRepository');
const billingUserRepository = require('../repositories/billingUserRepository');
const invoiceRepository = require('../repositories/invoiceRepository');
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
  return personalPaymentRepository.normalizeId(id);
}

async function cancelPendingForUser(userId, { exceptId = null } = {}) {
  const uid = toObjectId(userId);
  if (!uid) return;
  const filter = {
    user_id: uid,
    status: { $in: ['PENDING', 'PROCESSING'] }
  };
  if (exceptId) filter._id = { $ne: toObjectId(exceptId) };
  await personalPaymentRepository.cancelPendingForUser(
    uid,
    exceptId ? toObjectId(exceptId) : null
  );
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
  return personalPaymentRepository.findLatest(filter, { createdAt: -1 });
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
    const me = await billingUserRepository.findPersonalPlanById(uid);
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
  const recentPaid = await personalPaymentRepository.findLatest({
    user_id: uid,
    status: 'PAID',
    purpose: normPurpose,
    plan: normPlan,
    months: m,
    paid_at: { $gte: new Date(Date.now() - RECENT_PAID_WINDOW_MS) }
  }, { paid_at: -1 });
  if (recentPaid) {
    return buildQrPayload(recentPaid, baseUrl);
  }

  // Tái sử dụng PENDING cùng gói/kỳ hạn còn hạn (F5 / bấm Thanh toán lại)
  const existing = await personalPaymentRepository.findLatest({
    user_id: uid,
    status: 'PENDING',
    purpose: normPurpose,
    plan: normPlan,
    months: m,
    expires_at: { $gt: new Date() }
  }, { createdAt: -1 });

  if (existing) {
    // Hủy mọi PENDING khác (gói khác / đơn cũ lệch)
    await cancelPendingForUser(uid, { exceptId: existing._id });
    const changes = {
      expires_at: new Date(Date.now() + PAYMENT_TTL_MS),
      contact: {
      full_name: String(contact.full_name || existing.contact?.full_name || '').trim(),
      company: String(contact.company || existing.contact?.company || '').trim(),
      address: String(contact.address || existing.contact?.address || '').trim(),
      city: String(contact.city || existing.contact?.city || '').trim(),
      country: String(contact.country || existing.contact?.country || '').trim(),
      phone: String(contact.phone || existing.contact?.phone || '').trim()
      }
    };
    if (normPurpose === 'CREATE_ORG') {
      changes.org_meta = {
        name: String(orgMeta.name || existing.org_meta?.name || '').trim(),
        slug: String(orgMeta.slug || existing.org_meta?.slug || '').trim()
      };
    }
    const updated = await personalPaymentRepository.updatePayment(
      existing._id,
      changes
    );
    return buildQrPayload(updated, baseUrl);
  }

  // Không còn PENDING phù hợp → hủy toàn bộ PENDING/PROCESSING cũ rồi tạo mới
  await cancelPendingForUser(uid);

  const token = crypto.randomBytes(24).toString('hex');
  const payment = await personalPaymentRepository.createPayment({
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
  const payment = await personalPaymentRepository.findById(paymentId);
  if (!payment) throw Object.assign(new Error('Không tìm thấy đơn thanh toán.'), { status: 404 });
  if (payment.token !== token) {
    throw Object.assign(new Error('Token thanh toán không hợp lệ.'), { status: 403 });
  }
  return payment;
}

async function expireIfNeeded(payment) {
  if (payment.status === 'PENDING' && payment.expires_at && payment.expires_at.getTime() < Date.now()) {
    payment = await personalPaymentRepository.updatePayment(
      payment._id,
      { status: 'EXPIRED' }
    );
  }
  return payment;
}

/** Kiểm tra một ID có phải đơn thanh toán cá nhân không (để phân luồng ở app/bank). */
async function isPersonalPayment(id) {
  try {
    return personalPaymentRepository.existsById(id);
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
      const billingOrganizationRepository = require('../repositories/billingOrganizationRepository');
      const org = await billingOrganizationRepository.findBillingOrganizationById(
        payment.org_id_created
      );
      if (org) {
        out.organization = { _id: String(org._id), name: org.name, slug: org.slug, plan: org.plan };
        out.plan_expires_at = org.plan_expires_at || null;
      }
    } else {
      const user = await billingUserRepository.findPersonalPlanById(payment.user_id);
      out.plan_expires_at = user?.plan_expires_at || null;
    }
  }
  return out;
}

/**
 * Ghi nhận doanh thu nâng cấp PRO cá nhân vào Invoice (organization_id = null),
 * để hiển thị đồng nhất trên biểu đồ Thu/Chi, tab Tài chính và xuất CSV.
 * Idempotent theo external_ref = PERSONAL-<paymentId>.
 * Đồng thời ghi Payment ledger để tab «Thanh toán» / KPI payments_success khớp.
 */
async function createPersonalUpgradeInvoice(payment, user, options = {}) {
  const planCode = String(payment.plan || 'PRO').toUpperCase();
  const externalRef = `PERSONAL-${payment._id}`;
  let invoice = await invoiceRepository.findByTransactionReference(
    externalRef,
    { session: options.session }
  );
  if (!invoice) {
    const paidAt = payment.paid_at || new Date();
    const months = payment.months || 1;
    const periodDays = getPlanPeriodDays(planCode) * months;
    const periodEnd = new Date(paidAt);
    periodEnd.setDate(periodEnd.getDate() + periodDays);

    invoice = await invoiceRepository.createInvoice({
      organization_id: null,
      invoice_number: `PP-${String(user._id).slice(-6)}-${payment._id}`,
      status: 'PAID',
      plan: planCode,
      amount: payment.amount || 0,
      line_items_snapshot: [{
        code: planCode,
        description: `Nâng cấp ${planCode} cá nhân (${months} tháng)`,
        quantity: months,
        unit_amount: months ? Math.round((payment.amount || 0) / months) : payment.amount || 0
      }],
      tax_snapshot: { tax_amount: 0, included: false },
      customer_snapshot: {
        user_id: String(user._id),
        email: user.email || '',
        ...(payment.contact?.toObject ? payment.contact.toObject() : (payment.contact || {}))
      },
      seller_snapshot: { name: process.env.BILLING_SELLER_NAME || 'Indoor Navigation SaaS' },
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
    }, { session: options.session });
  }

  const { recordPaymentFromInvoice } = require('./paymentLedger');
  const ledgerResult = await recordPaymentFromInvoice(invoice, {
      method: 'TPTP',
      provider: 'TPTPPAY',
      provider_ref: externalRef,
      paid_at: invoice.paid_at || payment.paid_at || new Date(),
      external_ref: externalRef,
      note: invoice.note || `Thanh toán cá nhân ${planCode}`,
      created_by: user._id,
      metadata: {
        scope: 'personal',
        payment_id: String(payment._id),
        user_id: String(user._id),
        user_email: user.email || '',
        plan: planCode
      },
      session: options.session
    });
  const { captureReceipt } = require('./receiptService');
  await captureReceipt(invoice, {
    provider: 'TPTPPAY',
    externalRef,
    session: options.session
  });
  await personalPaymentRepository.updatePayment(payment._id, {
    invoice_id: invoice._id,
    payment_ledger_id: ledgerResult?.payment?._id || null,
    fulfillment_error: ''
  }, { session: options.session });

  return invoice;
}

/**
 * Xác nhận thanh toán từ phía ví (bank user đã đăng nhập).
 * UPGRADE → nâng cấp User.plan; CREATE_ORG → tạo tổ chức + đưa user thành ORG_ADMIN.
 */
async function confirmPersonalPayment({ bankUserId, paymentId, token }) {
  // Claim atomic: chỉ 1 lần confirm được trừ tiền; đơn CANCELLED/PAID/EXPIRED bị từ chối trước khi charge
  const claimed = await personalPaymentRepository.claimPending(paymentId, token);

  if (!claimed) {
    const payment = await findValidPayment(paymentId, token);
    const planCode = String(payment.plan || 'PRO').toUpperCase();
    const purpose = payment.purpose || 'UPGRADE';
    if (payment.status === 'PAID') {
      if (purpose === 'UPGRADE') {
        const paidUser = await billingUserRepository.findBillingUserById(
          payment.user_id
        );
        if (paidUser) await createPersonalUpgradeInvoice(payment, paidUser);
      }
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
    payment = await personalPaymentRepository.updatePayment(
      payment._id,
      { status: 'EXPIRED' }
    );
    throw Object.assign(new Error('Đơn thanh toán đã hết hạn hoặc bị hủy.'), { status: 400, code: 'PAYMENT_NOT_PENDING' });
  }

  const planCode = String(payment.plan || 'PRO').toUpperCase();
  const purpose = payment.purpose || 'UPGRADE';

  let user = await billingUserRepository.findBillingUserById(payment.user_id);
  if (!user) {
    await personalPaymentRepository
      .updatePayment(payment._id, { status: 'CANCELLED' })
      .catch(() => {});
    throw Object.assign(new Error('Không tìm thấy người dùng.'), { status: 404 });
  }

  const releaseClaim = async () => {
    try {
      if (payment.status === 'PROCESSING') {
        payment = await personalPaymentRepository.updatePayment(
          payment._id,
          { status: 'PENDING' }
        );
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

    const {
      finalizeCreateOrganizationPayment
    } = require('../application/billing/personalPaymentApplicationService');
    let finalized;
    try {
      finalized = await finalizeCreateOrganizationPayment({
        paymentId: payment._id,
        plan: planCode,
        bankUserId,
        bankTransactionId: charge.transaction?._id || null
      });
    } catch (finalizeError) {
      await personalPaymentRepository.updatePayment(payment._id, {
        status: 'PENDING',
        fulfillment_error: String(
          finalizeError.message || finalizeError
        ).slice(0, 1000)
      }).catch(() => {});
      throw Object.assign(finalizeError, {
        code: finalizeError.code || 'POST_DEBIT_FULFILLMENT_FAILED'
      });
    }
    payment = finalized.payment;
    const org = finalized.organization;

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
        payment = await personalPaymentRepository
          .updatePayment(payment._id, { status: 'CANCELLED' })
          .catch(() => payment);
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

  const {
    finalizePersonalUpgrade
  } = require('../application/billing/personalPaymentApplicationService');
  try {
    const finalized = await finalizePersonalUpgrade({
      paymentId: payment._id,
      plan: planCode,
      bankUserId,
      bankTransactionId: charge.transaction?._id || null
    });
    payment = finalized.payment;
    user = finalized.user;
  } catch (finalizeError) {
    await personalPaymentRepository.updatePayment(payment._id, {
      status: 'PENDING',
      fulfillment_error: String(
        finalizeError.message || finalizeError
      ).slice(0, 1000)
    }).catch(() => {});
    throw Object.assign(finalizeError, {
      code: finalizeError.code || 'POST_DEBIT_ACCOUNTING_FAILED'
    });
  }

  try {
    const { saveUserBillingProfile } = require('../utils/userBillingProfile');
    await saveUserBillingProfile(user._id, payment.contact || {});
  } catch (e) {
    console.warn('saveUserBillingProfile on personal PAID:', e.message);
  }

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
