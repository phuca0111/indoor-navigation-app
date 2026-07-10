// Phase 5.8 — Auth TPTPbank
const {
  registerBankUser,
  loginBankUser,
  getWalletSummary,
  topUpWallet,
  resolvePaymentFromQr,
  confirmBankPayment,
  listTransactions,
  TOPUP_MIN,
  TOPUP_MAX
} = require('../services/bankWalletService');

async function postRegister(req, res) {
  try {
    const { email, phone, password, full_name } = req.body;
    const result = await registerBankUser({
      email,
      phone,
      password,
      fullName: full_name
    });
    res.status(201).json(result);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function postLogin(req, res) {
  try {
    const { email, phone, password } = req.body;
    const result = await loginBankUser({ email, phone, password });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function getWallet(req, res) {
  try {
    const summary = await getWalletSummary(req.bankUserId);
    res.json(summary);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function postTopup(req, res) {
  try {
    const { amount, idempotency_key } = req.body;
    const result = await topUpWallet(req.bankUserId, amount, idempotency_key || '');
    res.status(result.duplicated ? 200 : 201).json({
      balance: result.wallet.balance,
      currency: result.wallet.currency,
      transaction: result.transaction,
      duplicated: result.duplicated
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function getTransactions(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const items = await listTransactions(req.bankUserId, limit);
    res.json({ items });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function getResolvePayment(req, res) {
  try {
    const { invoiceId, token } = req.query;
    if (!invoiceId || !token) {
      return res.status(400).json({ message: 'Thiếu invoiceId hoặc token.' });
    }
    const data = await resolvePaymentFromQr({ invoiceId, token });
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message });
  }
}

async function postConfirmPayment(req, res) {
  try {
    const { invoice_id, payment_token } = req.body;
    if (!invoice_id || !payment_token) {
      return res.status(400).json({ message: 'Thiếu invoice_id hoặc payment_token.' });
    }
    const result = await confirmBankPayment({
      bankUserId: req.bankUserId,
      invoiceId: invoice_id,
      token: payment_token
    });
    res.json({
      success: true,
      balance: result.wallet.balance,
      invoice_status: result.payment.invoice?.status,
      plan: result.payment.subscription?.plan,
      duplicated: result.duplicated
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

function getTopupLimits(req, res) {
  res.json({ min: TOPUP_MIN, max: TOPUP_MAX, currency: 'VND' });
}

module.exports = {
  postRegister,
  postLogin,
  getWallet,
  postTopup,
  getTransactions,
  getResolvePayment,
  postConfirmPayment,
  getTopupLimits
};
