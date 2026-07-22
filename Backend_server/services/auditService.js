const AuditLog = require('../models/AuditLog');

const SENSITIVE = /password|secret|token|otp|authorization|cookie|card_number|cvv/i;

function redact(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SENSITIVE.test(key) ? '[REDACTED]' : redact(item, depth + 1)
  ]));
}

function contextFromRequest(req) {
  return {
    actor_type: req?.user ? 'USER' : 'SYSTEM',
    actor_id: String(req?.user?.userId || ''),
    actor_role: String(req?.user?.role || ''),
    organization_id: req?.user?.organization_id || null,
    ip_address: String(req?.ip || req?.socket?.remoteAddress || ''),
    user_agent: String(req?.get?.('user-agent') || ''),
    request_id: String(req?.requestId || ''),
    correlation_id: String(req?.context?.correlationId || req?.requestId || '')
  };
}

async function writeAudit(input, options = {}) {
  const payload = {
    actor_type: input.actor_type || 'SYSTEM',
    actor_id: String(input.actor_id || ''),
    actor_role: String(input.actor_role || ''),
    organization_id: input.organization_id || null,
    action: String(input.action),
    resource_type: String(input.resource_type || 'unknown'),
    resource_id: String(input.resource_id || ''),
    before: redact(input.before ?? null),
    after: redact(input.after ?? null),
    patch: redact(input.patch ?? null),
    ip_address: String(input.ip_address || ''),
    user_agent: String(input.user_agent || ''),
    request_id: String(input.request_id || ''),
    correlation_id: String(input.correlation_id || ''),
    source: String(input.source || 'APPLICATION'),
    ...(input.source_id ? { source_id: String(input.source_id) } : {}),
    outcome: input.outcome || 'SUCCESS',
    reason: String(input.reason || '').slice(0, 1000),
    domain_event_id: String(input.domain_event_id || ''),
    occurred_at: input.occurred_at || new Date()
  };
  try {
    const docs = await AuditLog.create(
      [payload],
      options.session ? { session: options.session } : undefined
    );
    return { audit: docs[0], duplicated: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const audit = await AuditLog.findOne({
      source: payload.source,
      source_id: payload.source_id
    });
    return { audit, duplicated: true };
  }
}

async function dualWriteActivity(activity, options = {}) {
  const details = activity.details || {};
  return writeAudit({
    source: 'ACTIVITY_LOG',
    source_id: activity._id,
    actor_type: 'USER',
    actor_id: activity.user_id,
    organization_id: activity.organization_id || null,
    action: activity.action,
    resource_type: activity.target_type || 'unknown',
    resource_id: activity.target_id || '',
    before: details.before,
    after: details.after,
    patch: details,
    ip_address: activity.ip_address,
    occurred_at: activity.createdAt
  }, options);
}

module.exports = { redact, contextFromRequest, writeAudit, dualWriteActivity };
