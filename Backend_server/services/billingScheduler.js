// Phase 5.7 — Job định kỳ: grace / hết hạn subscription
// Phase 8 — nhắc email sắp hết hạn gói
const Organization = require('../models/Organization');
const User = require('../models/User');
const {
  getCurrentSubscription,
  refreshSubscriptionStatus
} = require('./subscriptionLifecycle');
const { refreshOrgBillingStatus } = require('../utils/overQuotaLock');
const { sendPlanExpiryReminderEmail } = require('./mailService');

const SCHEDULER_INTERVAL_MS = Number(process.env.BILLING_SCHEDULER_MS) || 60 * 60 * 1000;
let schedulerTimer = null;
let running = false;

function getExpiryRemindDays() {
  const n = Number(process.env.BILLING_EXPIRY_REMIND_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

function sameUtcDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getUTCFullYear() === db.getUTCFullYear() &&
    da.getUTCMonth() === db.getUTCMonth() &&
    da.getUTCDate() === db.getUTCDate()
  );
}

/**
 * Gửi mail nhắc sắp hết hạn (ACTIVE + plan_expires_at trong N ngày).
 * Dùng plan_expiry_reminded_at để tối đa 1 mail / ngày / org.
 */
async function sendExpiryReminders(stats) {
  const remindDays = getExpiryRemindDays();
  const now = Date.now();
  const windowEnd = now + remindDays * 24 * 60 * 60 * 1000;

  const candidates = await Organization.find({
    is_active: { $ne: false },
    billing_status: 'ACTIVE',
    plan_expires_at: { $ne: null, $gte: new Date(now), $lte: new Date(windowEnd) }
  }).select('_id name plan_expires_at plan_expiry_reminded_at');

  for (const org of candidates) {
    try {
      if (sameUtcDay(org.plan_expiry_reminded_at, new Date())) {
        continue;
      }

      const expiresAt = org.plan_expires_at;
      const daysLeft = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - now) / (24 * 60 * 60 * 1000))
      );

      const admin = await User.findOne({
        organization_id: org._id,
        role: 'ORG_ADMIN',
        is_active: { $ne: false }
      }).select('email').lean();

      if (admin?.email) {
        await sendPlanExpiryReminderEmail({
          to: admin.email,
          orgName: org.name,
          expiresAt,
          daysLeft
        });
        stats.reminders = (stats.reminders || 0) + 1;
      }

      org.plan_expiry_reminded_at = new Date();
      await org.save();
    } catch (e) {
      stats.errors += 1;
      console.warn('billingScheduler reminder org', org._id, e.message);
    }
  }
}

async function runBillingSchedulerOnce() {
  if (running) return { skipped: true };
  running = true;
  const stats = { scanned: 0, refreshed: 0, reminders: 0, errors: 0 };

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

    // Phase 8 — expiry reminders (mailService skip quietly nếu chưa SMTP)
    await sendExpiryReminders(stats);
  } finally {
    running = false;
  }

  if (stats.refreshed > 0 || stats.reminders > 0 || stats.errors > 0) {
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
  stopBillingScheduler,
  sendExpiryReminders,
  getExpiryRemindDays
};
