const financeOperations = require('../application/billing/financeOperationsApplicationService');

async function listPaymentMethods(req, res) {
  res.json({ payment_methods: await financeOperations.listPaymentMethods() });
}

async function upsertPaymentMethod(req, res) {
  try {
    const provider = String(req.params.provider || '').toUpperCase();
    const body = req.body || {};
    const paymentMethod = await financeOperations.savePaymentMethod(
      provider,
      body,
      req.user.userId
    );
    res.json({ payment_method: paymentMethod });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message, code: error.code });
  }
}

async function createReconciliation(req, res) {
  try {
    const provider = String(req.body?.provider || '').toUpperCase();
    const from = new Date(req.body?.from);
    const to = new Date(req.body?.to);
    if (!provider || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      return res.status(400).json({ message: 'provider/from/to không hợp lệ.' });
    }
    const run = await financeOperations.startReconciliation({
      provider,
      from,
      to,
      created_by: req.user.userId
    });
    res.status(201).json({ run });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function listReconciliations(req, res) {
  const runs = await financeOperations.listReconciliations(100);
  res.json({ runs });
}

async function getReconciliation(req, res) {
  const result = await financeOperations.getReconciliation(req.params.id);
  if (!result) return res.status(404).json({ message: 'Không tìm thấy lượt đối soát.' });
  res.json(result);
}

async function getDiscrepancies(req, res) {
  res.json({
    discrepancies: await financeOperations.getDiscrepancies(req.query.limit)
  });
}

module.exports = {
  listPaymentMethods,
  upsertPaymentMethod,
  createReconciliation,
  listReconciliations,
  getReconciliation,
  getDiscrepancies
};
