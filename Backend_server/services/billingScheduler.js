// Phase 5.7 — Job định kỳ: grace / hết hạn subscription
const Organization = require('../models/Organization');
const {
  getCurrentSubscription,
  refreshSubscriptionStatus
} = require('./subscriptionLifecycle');
const { refreshOrgBillingStatus } = require('../utils/overQuotaLock');

const SCHEDULER_INTERVAL_MS = Number(process.env.BILLING_SCHEDULER_MS) || 60 * 60 * 1000;
let schedulerTimer = null;
let running = false;

async function runBillingSchedulerOnce() {
  if (running) return { skipped: true };
  running = true;
  const stats = { scanned: 0, refreshed: 0, errors: 0 };

  try {
    const orgs = await Organization.find({ is_active: { $ne: false } })
      .select('_id plan billing_status grace_ends_at plan_expires_at')
      .lean();

    for (const row of orgs) {
      stats.scanned += 1;
      try {
        const org = await Organization.findById(row._id);
        if (!org) continue;
        const subscription = await getCurrentSubscription(org._id);
        if (subscription) {
          await refreshSubscriptionStatus(org, subscription);
          stats.refreshed += 1;
        } else {
          await refreshOrgBillingStatus(org);
        }
      } catch (e) {
        stats.errors += 1;
        console.warn('billingScheduler org', row._id, e.message);
      }
    }
  } finally {
    running = false;
  }

  if (stats.refreshed > 0 || stats.errors > 0) {
    console.log('[billingScheduler]', JSON.stringify(stats));
  }
  return stats;
}

function startBillingScheduler() {
  if (schedulerTimer) return;
  runBillingSchedulerOnce().catch((e) => console.warn('billingScheduler initial:', e.message));
  schedulerTimer = setInterval(() => {
    runBillingSchedulerOnce().catch((e) => console.warn('billingScheduler:', e.message));
  }, SCHEDULER_INTERVAL_MS);
  if (schedulerTimer.unref) schedulerTimer.unref();
}

function stopBillingScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

module.exports = {
  runBillingSchedulerOnce,
  startBillingScheduler,
  stopBillingScheduler
};
