const paymentMethodRepository = require('../../repositories/paymentMethodRepository');
const reconciliationRepository = require('../../repositories/reconciliationRepository');
const {
  runReconciliation,
  listDiscrepancies
} = require('../../services/reconciliationService');
const { getAdapter } = require('../../services/paymentGatewayAdapter');

function publicPaymentMethod(value) {
  const adapter = getAdapter(value.provider);
  return {
    ...value,
    provider_ready: adapter.ready(),
    secrets_source: 'ENV_ONLY'
  };
}

async function listPaymentMethods() {
  const rows = await paymentMethodRepository.listPaymentMethods();
  const byProvider = new Map(
    rows.map((row) => [String(row.provider), publicPaymentMethod(row)])
  );
  for (const provider of ['MOCK', 'TPTP', 'VNPAY']) {
    if (!byProvider.has(provider)) {
      const adapter = getAdapter(provider);
      byProvider.set(provider, {
        provider,
        display_name: provider,
        enabled: false,
        mode: provider === 'MOCK' ? 'MOCK' : 'SANDBOX',
        provider_ready: adapter.ready(),
        secrets_source: 'ENV_ONLY',
        persisted: false
      });
    }
  }
  return [...byProvider.values()];
}

async function savePaymentMethod(provider, input, actorUserId) {
  getAdapter(provider);
  const forbidden =
    Object.keys(input).some((key) =>
      /(secret|password|private_key|access_token)/i.test(key)
    ) ||
    /(secret|password|private[_-]?key|access[_-]?token)/i.test(
      JSON.stringify(input.public_config || {})
    );
  if (forbidden) {
    throw Object.assign(new Error('Secret chỉ được cấu hình qua env.'), {
      status: 400,
      code: 'SECRET_ENV_ONLY'
    });
  }
  const saved = await paymentMethodRepository.savePaymentMethod(provider, {
    display_name: String(input.display_name || provider),
    enabled: input.enabled === true,
    mode: input.mode || 'SANDBOX',
    currency: input.currency || 'VND',
    capabilities: input.capabilities || {},
    public_config: input.public_config || {},
    credential_env_keys: Array.isArray(input.credential_env_keys)
      ? input.credential_env_keys
      : [],
    updated_by: actorUserId
  });
  return publicPaymentMethod(saved);
}

async function startReconciliation(input) {
  return runReconciliation(input);
}

async function listReconciliations(limit) {
  return reconciliationRepository.listRuns(limit);
}

async function getReconciliation(runId) {
  const run = await reconciliationRepository.findRunById(runId);
  if (!run) return null;
  const items = await reconciliationRepository.listItemsForRun(run._id);
  return { run, items };
}

async function getDiscrepancies(limit) {
  return listDiscrepancies(limit);
}

module.exports = {
  listPaymentMethods,
  savePaymentMethod,
  startReconciliation,
  listReconciliations,
  getReconciliation,
  getDiscrepancies
};
