const { contactStats } = require('../../services/contactCrmService');

async function formInboxSummary() {
  const stats = await contactStats();
  return {
    status: stats.status,
    types: Object.entries(stats.types || {}).map(([key, total]) => ({
      request_type: key,
      total
    })),
    month_count: stats.month_count,
    avg_reply_hours: stats.avg_reply_hours
  };
}

module.exports = { formInboxSummary };
