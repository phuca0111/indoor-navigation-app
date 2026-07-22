const financeSettingsRepository = require('../../repositories/financeSettingsRepository');
const {
  getReportSummaryForUser,
  exportReportForUser
} = require('../read/financeReportsQueryService');

async function getReportSummary(range, user) {
  return getReportSummaryForUser(user || { role: 'SUPER_ADMIN' }, range);
}

async function exportReport(kind, format, range, user) {
  return exportReportForUser(user || { role: 'SUPER_ADMIN' }, kind, format, range);
}

async function getOrCreateSettings() {
  return financeSettingsRepository.getOrCreateDefaultSettings();
}

async function updateSettings(input) {
  const changes = {};
  if (input.company_name !== undefined) {
    changes.company_name = String(input.company_name || '').trim();
  }
  if (input.tax_code !== undefined) {
    changes.tax_code = String(input.tax_code || '').trim();
  }
  if (input.address !== undefined) {
    changes.address = String(input.address || '').trim();
  }
  if (input.currency !== undefined) {
    changes.currency = String(input.currency || 'VND').trim() || 'VND';
  }
  if (input.default_tax_percent !== undefined) {
    const value = Number(input.default_tax_percent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw Object.assign(new Error('default_tax_percent phải từ 0–100.'), {
        status: 400
      });
    }
    changes.default_tax_percent = value;
  }
  if (input.invoice_prefix !== undefined) {
    changes.invoice_prefix =
      String(input.invoice_prefix || 'INV').trim().toUpperCase() || 'INV';
  }
  if (input.invoice_footer !== undefined) {
    changes.invoice_footer = String(input.invoice_footer || '').trim();
  }
  if (input.reminder_days_before_expiry !== undefined) {
    const value = Number(input.reminder_days_before_expiry);
    if (!Number.isFinite(value) || value < 1 || value > 90) {
      throw Object.assign(
        new Error('reminder_days_before_expiry phải 1–90.'),
        { status: 400 }
      );
    }
    changes.reminder_days_before_expiry = value;
  }
  return financeSettingsRepository.updateDefaultSettings(changes);
}

module.exports = {
  getReportSummary,
  exportReport,
  getOrCreateSettings,
  updateSettings
};
