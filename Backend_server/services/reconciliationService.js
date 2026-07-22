const reconciliationRepository = require('../repositories/reconciliationRepository');
const paymentRepository = require('../repositories/paymentRepository');

function classifyReconciliation(internalRows = [], providerRows = []) {
  const internalByRef = new Map();
  const providerByRef = new Map();
  for (const row of internalRows) {
    const ref = String(row.provider_ref || row.external_ref || '');
    if (!internalByRef.has(ref)) internalByRef.set(ref, []);
    internalByRef.get(ref).push(row);
  }
  for (const row of providerRows) {
    const ref = String(row.provider_ref || '');
    if (!providerByRef.has(ref)) providerByRef.set(ref, []);
    providerByRef.get(ref).push(row);
  }
  const refs = new Set([...internalByRef.keys(), ...providerByRef.keys()]);
  const result = [];
  for (const ref of refs) {
    const internals = internalByRef.get(ref) || [];
    const providers = providerByRef.get(ref) || [];
    if (internals.length > 1 || providers.length > 1) {
      result.push({ classification: 'DUPLICATE', provider_ref: ref, internal: internals[0], provider: providers[0] });
      continue;
    }
    if (!internals.length) {
      result.push({ classification: 'MISSING_INTERNAL', provider_ref: ref, provider: providers[0] });
      continue;
    }
    if (!providers.length) {
      result.push({ classification: 'MISSING_PROVIDER', provider_ref: ref, internal: internals[0] });
      continue;
    }
    const internal = internals[0];
    const provider = providers[0];
    if (Number(internal.amount_minor ?? internal.amount) !== Number(provider.amount_minor)) {
      result.push({ classification: 'AMOUNT_MISMATCH', provider_ref: ref, internal, provider });
    } else {
      const internalOk = ['SUCCESS', 'REFUNDED'].includes(String(internal.status).toUpperCase());
      const providerOk = ['SUCCESS', 'COMPLETED'].includes(String(provider.status).toUpperCase());
      result.push({
        classification: internalOk === providerOk ? 'MATCHED' : 'STATUS_MISMATCH',
        provider_ref: ref,
        internal,
        provider
      });
    }
  }
  return result;
}

async function runReconciliation({ provider, from, to, created_by }) {
  let run = await reconciliationRepository.createRun({
    provider, from, to, created_by, status: 'RUNNING', started_at: new Date()
  });
  try {
    const [payments, providerRows] = await Promise.all([
      paymentRepository.findProviderPayments({ provider, from, to }),
      reconciliationRepository.findProviderTransactions({ provider, from, to })
    ]);
    const classified = classifyReconciliation(payments.map((row) => ({
      ...row, amount_minor: Math.round(Number(row.amount))
    })), providerRows);
    if (classified.length) {
      await reconciliationRepository.insertItems(classified.map((item) => ({
        run_id: run._id,
        provider,
        provider_ref: item.provider_ref,
        merchant_ref: item.provider?.merchant_ref || '',
        classification: item.classification,
        internal_amount_minor: item.internal ? Number(item.internal.amount_minor ?? item.internal.amount) : null,
        provider_amount_minor: item.provider ? Number(item.provider.amount_minor) : null,
        internal_status: item.internal?.status || '',
        provider_status: item.provider?.status || '',
        payment_id: item.internal?._id || null,
        provider_transaction_id: item.provider?._id || null
      })));
    }
    const summary = classified.reduce((out, item) => {
      out[item.classification] = (out[item.classification] || 0) + 1;
      return out;
    }, { total: classified.length });
    run = await reconciliationRepository.updateRun(run._id, {
      status: 'COMPLETED',
      summary,
      completed_at: new Date()
    });
    return run;
  } catch (error) {
    await reconciliationRepository.updateRun(run._id, {
      status: 'FAILED',
      error: String(error.message || error).slice(0, 1000),
      completed_at: new Date()
    });
    throw error;
  }
}

async function listDiscrepancies(limit = 200) {
  return reconciliationRepository.listDiscrepancies(limit);
}

module.exports = { classifyReconciliation, runReconciliation, listDiscrepancies };
