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
const { listPlans, DEFAULT_SEED } = require('../services/planCatalog');

/** GET /api/billing/plans — public catalog cho Landing (WL2), không cần auth */
async function listPublicPlans(req, res) {
  try {
    let plans = await listPlans({ activeOnly: true });
    if (!plans || !plans.length) {
      plans = DEFAULT_SEED.map((p) => ({ ...p, is_active: true }));
    }
    const publicPlans = plans.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description || '',
      price_vnd: Number(p.price_vnd) || 0,
      period_days: Number(p.period_days) || 30,
      max_buildings: p.max_buildings == null ? null : Number(p.max_buildings),
      max_users: p.max_users == null ? null : Number(p.max_users),
      features: Array.isArray(p.features) ? p.features : [],
      sort_order: Number(p.sort_order) || 0
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

    // Phase 8.5 — KYC tối thiểu khi nâng PRO/ENTERPRISE
    if (plan === 'PRO' || plan === 'ENTERPRISE') {
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
  listPublicPlans,
  getMyBilling,
  postCheckout,
  resolveOrgForBilling
};
