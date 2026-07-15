// Finance — Báo cáo CSV + cấu hình hóa đơn / công ty
const FinanceSettings = require('../models/FinanceSettings');
const { buildReportSummary, exportCsv } = require('../services/financeReports');

async function getOrCreateSettings() {
  let doc = await FinanceSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await FinanceSettings.create({ key: 'default' });
  }
  return doc;
}

async function getReportSummary(req, res) {
  try {
    const summary = await buildReportSummary({
      from: req.query.from,
      to: req.query.to
    });
    res.status(200).json({ summary });
  } catch (e) {
    console.error('getReportSummary:', e);
    res.status(500).json({ message: e.message });
  }
}

async function exportReport(req, res) {
  try {
    const kind = req.query.kind || req.query.type || 'invoices';
    const { filename, csv } = await exportCsv(kind, {
      from: req.query.from,
      to: req.query.to
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM giúp Excel mở UTF-8
    res.status(200).send('\uFEFF' + csv);
  } catch (e) {
    console.error('exportReport:', e);
    res.status(500).json({ message: e.message });
  }
}

async function getFinanceSettings(req, res) {
  try {
    const settings = await getOrCreateSettings();
    res.status(200).json({ settings });
  } catch (e) {
    console.error('getFinanceSettings:', e);
    res.status(500).json({ message: e.message });
  }
}

async function updateFinanceSettings(req, res) {
  try {
    const doc = await getOrCreateSettings();
    const body = req.body || {};
    if (body.company_name !== undefined) doc.company_name = String(body.company_name || '').trim();
    if (body.tax_code !== undefined) doc.tax_code = String(body.tax_code || '').trim();
    if (body.address !== undefined) doc.address = String(body.address || '').trim();
    if (body.currency !== undefined) doc.currency = String(body.currency || 'VND').trim() || 'VND';
    if (body.default_tax_percent !== undefined) {
      const n = Number(body.default_tax_percent);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({ message: 'default_tax_percent phải từ 0–100.' });
      }
      doc.default_tax_percent = n;
    }
    if (body.invoice_prefix !== undefined) {
      doc.invoice_prefix = String(body.invoice_prefix || 'INV').trim().toUpperCase() || 'INV';
    }
    if (body.invoice_footer !== undefined) doc.invoice_footer = String(body.invoice_footer || '').trim();
    if (body.reminder_days_before_expiry !== undefined) {
      const d = Number(body.reminder_days_before_expiry);
      if (!Number.isFinite(d) || d < 1 || d > 90) {
        return res.status(400).json({ message: 'reminder_days_before_expiry phải 1–90.' });
      }
      doc.reminder_days_before_expiry = d;
    }
    await doc.save();
    res.status(200).json({ message: 'Đã lưu cấu hình Finance.', settings: doc });
  } catch (e) {
    console.error('updateFinanceSettings:', e);
    res.status(500).json({ message: e.message });
  }
}

module.exports = {
  getReportSummary,
  exportReport,
  getFinanceSettings,
  updateFinanceSettings,
  getOrCreateSettings
};
