const crypto = require('crypto');
const { createWebhookRepository } = require('../repositories/webhookRepository');

const SENSITIVE_KEY = /(signature|securehash|secret|password|token|authorization)/i;

function sanitizePayload(value) {
  if (Array.isArray(value)) return value.map(sanitizePayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitizePayload(child)
  ]));
}

function eventKey(provider, payload = {}) {
  const explicit = payload.event_id || payload.id || payload.vnp_TransactionNo || payload.vnp_TxnRef;
  if (explicit) return String(explicit);
  return crypto.createHash('sha256').update(`${provider}:${JSON.stringify(payload)}`).digest('hex');
}

async function receiveWebhook({ provider, payload, signatureStatus, event_key }, deps = {}) {
  const repository = createWebhookRepository(deps);
  const baseKey = event_key || eventKey(provider, payload);
  // Callback chữ ký sai vẫn được lưu để điều tra, nhưng không được chiếm khóa idempotency
  // của callback hợp lệ đến sau (tránh webhook poisoning).
  const key = ['VALID', 'NOT_REQUIRED'].includes(signatureStatus)
    ? baseKey
    : `${baseKey}:${signatureStatus}:${crypto.createHash('sha256').update(JSON.stringify(payload || {})).digest('hex').slice(0, 16)}`;
  try {
    const inbox = await repository.createInbox({
      provider,
      event_key: key,
      raw_payload: payload,
      sanitized_payload: sanitizePayload(payload),
      signature_status: signatureStatus,
      process_status: signatureStatus === 'VALID' || signatureStatus === 'NOT_REQUIRED' ? 'RECEIVED' : 'REJECTED'
    });
    return { inbox, duplicated: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return {
      inbox: await repository.findInboxByProviderEvent(provider, key),
      duplicated: true
    };
  }
}

async function processWebhook(inbox, handler, deps = {}) {
  const repository = createWebhookRepository(deps);
  const owner = deps.owner || `webhook-worker:${process.pid}`;
  const staleBefore = new Date();
  const claimed = await repository.claimInbox(inbox._id, owner, staleBefore);
  if (!claimed) {
    const current = await repository.findInboxById(inbox._id);
    return { duplicated: true, inbox: current };
  }
  try {
    const result = await handler(claimed);
    await repository.markInboxProcessed(claimed._id);
    return { duplicated: false, inbox: claimed, result };
  } catch (error) {
    await repository.markInboxFailed(claimed._id, error);
    throw error;
  }
}

async function recordProviderTransaction(data, deps = {}) {
  const repository = createWebhookRepository(deps);
  const businessFingerprint = data.business_fingerprint || crypto
    .createHash('sha256')
    .update([
      String(data.provider || '').toUpperCase(),
      String(data.merchant_ref || ''),
      String(data.transaction_type || 'PAYMENT').toUpperCase(),
      Number(data.amount_minor || 0),
      String(data.currency || 'VND').toUpperCase()
    ].join('|'))
    .digest('hex');
  const input = { ...data, business_fingerprint: businessFingerprint };
  try {
    return await repository.createProviderTransaction(input);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existing = await repository.findProviderTransaction(
      input.provider,
      input.provider_ref,
      businessFingerprint
    );
    const same = existing &&
      String(existing.merchant_ref) === String(input.merchant_ref) &&
      Number(existing.amount_minor) === Number(input.amount_minor) &&
      String(existing.currency) === String(input.currency) &&
      String(existing.transaction_type || 'PAYMENT') ===
        String(input.transaction_type || 'PAYMENT');
    if (!same) {
      throw Object.assign(new Error('Provider reference đã gắn với giao dịch khác.'), {
        status: 409,
        code: 'PROVIDER_REFERENCE_CONFLICT'
      });
    }
    return existing;
  }
}

module.exports = {
  sanitizePayload,
  eventKey,
  receiveWebhook,
  processWebhook,
  recordProviderTransaction
};
