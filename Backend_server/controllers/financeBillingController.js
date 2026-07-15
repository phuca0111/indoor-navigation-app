/**
 * Finance — Gói / Hóa đơn / PDF / thu tiền (Super + Finance Admin)
 */
const Plan = require('../models/Plan');
const Invoice = require('../models/Invoice');
const Organization = require('../models/Organization');
const {
  ensureDefaultPlans,
  refreshPlanCache,
  listPlans
} = require('../services/planCatalog');
const { createOpenInvoice } = require('../services/subscriptionLifecycle');
const { listPayments } = require('../services/paymentLedger');
const { getPlanPrice } = require('../config/planPricing');

function invoiceTotal(inv) {
  const amount = Number(inv.amount) || 0;
  const tax = Number(inv.tax_amount) || 0;
  const discount = Number(inv.discount_amount) || 0;
  return Math.max(0, amount - discount + tax);
}

/** null = không giới hạn; bỏ qua undefined/''/NaN */
function parseNullableLimit(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildInvoiceHtml(inv, org, settings) {
  const total = invoiceTotal(inv);
  const orgName = org?.name || String(inv.organization_id);
  const company = settings?.company_name || 'Indoor Navigation SaaS';
  const footer = settings?.invoice_footer || '';
  const taxCode = settings?.tax_code ? `<br><strong>MST:</strong> ${String(settings.tax_code).replace(/</g, '&lt;')}` : '';
  return `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"><title>Hóa đơn ${inv.invoice_number}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;color:#111}
h1{font-size:22px} table{width:100%;border-collapse:collapse;margin-top:16px}
td,th{border:1px solid #ddd;padding:8px;text-align:left}
.muted{color:#666;font-size:13px}
@media print{button{display:none}}
</style></head><body>
<button onclick="window.print()">In / Lưu PDF</button>
<h1>Hóa đơn ${inv.invoice_number}</h1>
<p class="muted">${String(company).replace(/</g, '&lt;')}${taxCode}</p>
<p><strong>Tổ chức:</strong> ${orgName}<br>
<strong>Gói:</strong> ${inv.plan || '-'}<br>
<strong>Trạng thái:</strong> ${inv.status}<br>
<strong>Ngày tạo:</strong> ${inv.createdAt ? new Date(inv.createdAt).toLocaleString('vi-VN') : '-'}<br>
<strong>Hạn thanh toán:</strong> ${inv.due_at ? new Date(inv.due_at).toLocaleString('vi-VN') : '-'}
</p>
<table>
<tr><th>Mô tả</th><th>Số tiền (VND)</th></tr>
<tr><td>Phí gói ${inv.plan || ''}</td><td>${Number(inv.amount || 0).toLocaleString('vi-VN')}</td></tr>
<tr><td>Giảm giá</td><td>${Number(inv.discount_amount || 0).toLocaleString('vi-VN')}</td></tr>
<tr><td>Thuế</td><td>${Number(inv.tax_amount || 0).toLocaleString('vi-VN')}</td></tr>
<tr><th>Tổng</th><th>${total.toLocaleString('vi-VN')}</th></tr>
</table>
${inv.note ? `<p><strong>Ghi chú:</strong> ${String(inv.note).replace(/</g, '&lt;')}</p>` : ''}
${footer ? `<p class="muted">${String(footer).replace(/</g, '&lt;')}</p>` : ''}
</body></html>`;
}

async function listPlansHandler(req, res) {
  try {
    const plans = await listPlans({ activeOnly: req.query.active === 'true' });
    res.status(200).json({ plans });
  } catch (e) {
    console.error('listPlans:', e);
    res.status(500).json({ message: e.message });
  }
}

async function createPlan(req, res) {
  try {
    await ensureDefaultPlans();
    const body = req.body || {};
    const code = String(body.code || '').toUpperCase().trim();
    if (!code) return res.status(400).json({ message: 'Thiếu code gói.' });
    const doc = await Plan.create({
      code,
      name: String(body.name || code).trim(),
      description: String(body.description || '').trim(),
      price_vnd: Number(body.price_vnd) || 0,
      period_days: Number(body.period_days) || 30,
      max_buildings: parseNullableLimit(body.max_buildings),
      max_users: parseNullableLimit(body.max_users),
      is_active: body.is_active !== false,
      sort_order: Number(body.sort_order) || 0,
      features: Array.isArray(body.features) ? body.features : []
    });
    await refreshPlanCache();
    res.status(201).json({ message: 'Đã tạo gói.', plan: doc });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ message: 'Mã gói đã tồn tại.' });
    console.error('createPlan:', e);
    res.status(500).json({ message: e.message });
  }
}

async function updatePlan(req, res) {
  try {
    const doc = await Plan.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Không tìm thấy gói.' });
    const body = req.body || {};
    if (body.name !== undefined) doc.name = String(body.name).trim();
    if (body.description !== undefined) doc.description = String(body.description).trim();
    if (body.price_vnd !== undefined) doc.price_vnd = Number(body.price_vnd) || 0;
    if (body.period_days !== undefined) doc.period_days = Number(body.period_days) || 30;
    if (body.max_buildings !== undefined) {
      doc.max_buildings = parseNullableLimit(body.max_buildings);
    }
    if (body.max_users !== undefined) {
      doc.max_users = parseNullableLimit(body.max_users);
    }
    if (body.is_active !== undefined) doc.is_active = !!body.is_active;
    if (body.sort_order !== undefined) doc.sort_order = Number(body.sort_order) || 0;
    if (body.features !== undefined) doc.features = Array.isArray(body.features) ? body.features : [];
    await doc.save();
    await refreshPlanCache();
    res.status(200).json({ message: 'Đã cập nhật gói.', plan: doc });
  } catch (e) {
    console.error('updatePlan:', e);
    res.status(500).json({ message: e.message });
  }
}

async function listInvoices(req, res) {
  try {
    const filter = {};
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();
    if (req.query.organization_id) filter.organization_id = req.query.organization_id;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const invoices = await Invoice.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('organization_id', 'name slug plan')
      .lean();
    res.status(200).json({
      invoices: invoices.map((inv) => ({
        ...inv,
        total: invoiceTotal(inv),
        organization: inv.organization_id
      }))
    });
  } catch (e) {
    console.error('listInvoices:', e);
    res.status(500).json({ message: e.message });
  }
}

async function createManualInvoice(req, res) {
  try {
    const body = req.body || {};
    const orgId = body.organization_id;
    if (!orgId) return res.status(400).json({ message: 'Thiếu organization_id.' });
    const org = await Organization.findById(orgId);
    if (!org) return res.status(404).json({ message: 'Không tìm thấy tổ chức.' });

    const plan = String(body.plan || org.plan || 'PRO').toUpperCase();
    const catalogPrice = getPlanPrice(plan);
    let amount;
    if (body.amount === undefined || body.amount === null || body.amount === '') {
      amount = catalogPrice;
    } else {
      amount = Number(body.amount);
    }
    // 0 / NaN trên gói trả phí → lấy giá catalog (tránh tạo HĐ = 0 rồi Đã thu)
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'amount không hợp lệ.' });
    }
    if (amount === 0 && plan !== 'FREE') {
      amount = catalogPrice;
    }
    if (amount === 0 && plan !== 'FREE') {
      return res.status(400).json({
        message: `Chưa có giá catalog cho gói ${plan}.`,
        code: 'PLAN_PRICE_MISSING'
      });
    }

    const { invoice } = await createOpenInvoice({
      org,
      plan,
      amount,
      currency: body.currency || 'VND',
      periodStart: body.period_start ? new Date(body.period_start) : new Date(),
      periodEnd: body.period_end ? new Date(body.period_end) : null,
      note: body.note || 'Hóa đơn thủ công (Super)',
      createdBy: req.user.userId,
      metadata: { source: 'MANUAL_SUPER' },
      idempotencyKey: body.idempotency_key || `manual-${orgId}-${Date.now()}`
    });

    if (body.tax_amount !== undefined) invoice.tax_amount = Number(body.tax_amount) || 0;
    if (body.discount_amount !== undefined) invoice.discount_amount = Number(body.discount_amount) || 0;
    if (body.due_at) invoice.due_at = new Date(body.due_at);
    await invoice.save();

    res.status(201).json({
      message: 'Đã tạo hóa đơn OPEN.',
      invoice: { ...invoice.toObject(), total: invoiceTotal(invoice) }
    });
  } catch (e) {
    console.error('createManualInvoice:', e);
    res.status(500).json({ message: e.message });
  }
}

async function updateInvoice(req, res) {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    if (inv.status !== 'OPEN' && inv.status !== 'DRAFT') {
      return res.status(400).json({
        message: `Chỉ sửa hóa đơn OPEN/DRAFT (hiện: ${inv.status}).`,
        code: 'INVOICE_NOT_EDITABLE'
      });
    }
    const body = req.body || {};
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return res.status(400).json({ message: 'amount không hợp lệ.' });
      }
      inv.amount = amount;
    }
    if (body.tax_amount !== undefined) inv.tax_amount = Number(body.tax_amount) || 0;
    if (body.discount_amount !== undefined) inv.discount_amount = Number(body.discount_amount) || 0;
    if (body.note !== undefined) inv.note = String(body.note || '');
    if (body.due_at !== undefined) {
      inv.due_at = body.due_at ? new Date(body.due_at) : null;
    }
    if (body.plan !== undefined) inv.plan = String(body.plan).toUpperCase();
    await inv.save();
    res.status(200).json({
      message: 'Đã cập nhật hóa đơn.',
      invoice: { ...inv.toObject(), total: invoiceTotal(inv) }
    });
  } catch (e) {
    console.error('updateInvoice:', e);
    res.status(500).json({ message: e.message });
  }
}

async function voidInvoice(req, res) {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    if (inv.status === 'PAID') {
      return res.status(400).json({ message: 'Không hủy hóa đơn đã PAID.', code: 'INVOICE_PAID' });
    }
    if (inv.status === 'VOID') {
      return res.status(200).json({ message: 'Hóa đơn đã VOID.', invoice: inv });
    }
    inv.status = 'VOID';
    inv.note = (inv.note ? inv.note + ' | ' : '') + (req.body?.reason || 'Super void');
    await inv.save();
    res.status(200).json({ message: 'Đã hủy hóa đơn (VOID).', invoice: inv });
  } catch (e) {
    console.error('voidInvoice:', e);
    res.status(500).json({ message: e.message });
  }
}

/**
 * Super ghi nhận đã thu HĐ OPEN/DRAFT → PAID + sổ Payment.
 * Không tự kích hoạt subscription (tránh tạo HĐ PAID trùng); gia hạn gói vẫn ở tab Gói & TT nếu cần.
 */
async function markInvoicePaidHandler(req, res) {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    if (inv.status === 'PAID') {
      return res.status(200).json({
        message: 'Hóa đơn đã PAID.',
        invoice: { ...inv.toObject(), total: invoiceTotal(inv) },
        already_paid: true
      });
    }
    if (inv.status === 'VOID' || inv.status === 'UNCOLLECTIBLE') {
      return res.status(400).json({
        message: `Không thu hóa đơn ${inv.status}.`,
        code: 'INVOICE_NOT_COLLECTIBLE'
      });
    }
    if (inv.status !== 'OPEN' && inv.status !== 'DRAFT') {
      return res.status(400).json({
        message: `Chỉ thu hóa đơn OPEN/DRAFT (hiện: ${inv.status}).`,
        code: 'INVOICE_NOT_COLLECTIBLE'
      });
    }

    const body = req.body || {};
    const provider = String(body.method || body.provider || 'MANUAL').toUpperCase();
    const { markInvoicePaid } = require('../services/subscriptionLifecycle');
    const paid = await markInvoicePaid(inv, {
      externalRef: body.external_ref || body.externalRef || '',
      provider,
      createdBy: req.user.userId
    });

    res.status(200).json({
      message: 'Đã ghi nhận thu hóa đơn (PAID).',
      invoice: { ...paid.toObject(), total: invoiceTotal(paid) },
      already_paid: false
    });
  } catch (e) {
    console.error('markInvoicePaidHandler:', e);
    res.status(500).json({ message: e.message });
  }
}

async function getInvoicePdf(req, res) {
  try {
    const inv = await Invoice.findById(req.params.id).lean();
    if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    const org = await Organization.findById(inv.organization_id).select('name slug').lean();
    let settings = null;
    try {
      const { getOrCreateSettings } = require('./financeAdminController');
      settings = await getOrCreateSettings();
    } catch (_) { /* optional */ }
    const html = buildInvoiceHtml(inv, org, settings);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="invoice-${inv.invoice_number || inv._id}.html"`
    );
    res.status(200).send(html);
  } catch (e) {
    console.error('getInvoicePdf:', e);
    res.status(500).json({ message: e.message });
  }
}

async function sendInvoiceEmail(req, res) {
  try {
    const inv = await Invoice.findById(req.params.id);
    if (!inv) return res.status(404).json({ message: 'Không tìm thấy hóa đơn.' });
    const User = require('../models/User');
    const org = await Organization.findById(inv.organization_id).select('name').lean();
    const admin = await User.findOne({
      organization_id: inv.organization_id,
      role: 'ORG_ADMIN',
      is_active: { $ne: false }
    })
      .select('email')
      .lean();

    if (!admin?.email) {
      return res.status(400).json({ message: 'Org chưa có ORG_ADMIN email để gửi.' });
    }

    const { getTransporter } = require('../services/mailService');
    const transporter = getTransporter();
    // getTransporter() trả null khi chưa SMTP; test có thể inject mock qua setTestTransporter
    if (!transporter) {
      return res.status(200).json({
        message: 'SMTP chưa cấu hình — đã bỏ qua gửi mail (sandbox).',
        skipped: true,
        to: admin.email
      });
    }

    const total = invoiceTotal(inv);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: admin.email,
      subject: `Hóa đơn ${inv.invoice_number} — ${org?.name || 'Tổ chức'}`,
      text:
        `Hóa đơn ${inv.invoice_number}\n` +
        `Tổ chức: ${org?.name || ''}\n` +
        `Gói: ${inv.plan}\n` +
        `Tổng: ${total.toLocaleString('vi-VN')} VND\n` +
        `Trạng thái: ${inv.status}\n`
    });

    res.status(200).json({ message: 'Đã gửi email hóa đơn.', to: admin.email, skipped: false });
  } catch (e) {
    console.error('sendInvoiceEmail:', e);
    res.status(500).json({ message: e.message });
  }
}

async function listPaymentsHandler(req, res) {
  try {
    const payments = await listPayments(
      {
        organization_id: req.query.organization_id,
        status: req.query.status,
        method: req.query.method,
        invoice_id: req.query.invoice_id
      },
      req.query.limit
    );
    res.status(200).json({ payments });
  } catch (e) {
    console.error('listPayments:', e);
    res.status(500).json({ message: e.message });
  }
}

module.exports = {
  listPlansHandler,
  createPlan,
  updatePlan,
  listInvoices,
  createManualInvoice,
  updateInvoice,
  voidInvoice,
  getInvoicePdf,
  sendInvoiceEmail,
  listPaymentsHandler,
  markInvoicePaidHandler,
  invoiceTotal
};
