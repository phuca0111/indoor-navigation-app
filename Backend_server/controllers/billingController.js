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

    const session = await createCheckoutSession({
      org,
      plan,
      action,
      userId: req.user.userId,
      ipAddr: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1'
    });

    res.status(201).json({
      message: 'Tạo phiên thanh toán thành công.',
      provider: session.provider,
      checkout_url: session.checkout_url,
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

module.exports = {
  getMyBilling,
  postCheckout,
  resolveOrgForBilling
};
