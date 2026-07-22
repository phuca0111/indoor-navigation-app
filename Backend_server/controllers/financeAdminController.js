// Finance — Báo cáo CSV + cấu hình hóa đơn / công ty
const financeAdmin = require('../application/billing/financeAdminApplicationService');

async function getOrCreateSettings() {
  return financeAdmin.getOrCreateSettings();
}

async function getReportSummary(req, res) {
  try {
    const summary = await financeAdmin.getReportSummary({
      from: req.query.from,
      to: req.query.to
    }, req.user);
    res.status(200).json({ summary });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('getReportSummary:', e);
    res.status(status).json({ message: e.message });
  }
}

async function exportReport(req, res) {
  try {
    const kind = req.query.kind || req.query.type || 'invoices';
    const format = String(req.query.format || 'csv').toLowerCase();
    if (format !== 'csv') {
      const output = await financeAdmin.exportReport(kind, format, {
        from: req.query.from,
        to: req.query.to
      }, req.user);
      res.setHeader('Content-Type', output.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${output.filename}"`);
      return res.status(200).send(output.buffer);
    }
    const { filename, csv } = await financeAdmin.exportReport(kind, format, {
      from: req.query.from,
      to: req.query.to
    }, req.user);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM giúp Excel mở UTF-8
    res.status(200).send('\uFEFF' + csv);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('exportReport:', e);
    res.status(status).json({ message: e.message });
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
    const body = req.body || {};
    const doc = await financeAdmin.updateSettings(body);
    res.status(200).json({ message: 'Đã lưu cấu hình Finance.', settings: doc });
  } catch (e) {
    console.error('updateFinanceSettings:', e);
    res.status(e.status || 500).json({ message: e.message });
  }
}

module.exports = {
  getReportSummary,
  exportReport,
  getFinanceSettings,
  updateFinanceSettings,
  getOrCreateSettings
};
