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
  TOPUP_MAX,
  isPersonalPayment,
  resolvePersonalPaymentForApp,
  resolvePersonalPayment,
  confirmPersonalPayment
} = require('../application/billing/bankWalletApplicationService');

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
    // Đơn thanh toán gói cá nhân dùng chung schema QR (invoiceId = paymentId)
    if (await isPersonalPayment(invoiceId)) {
      const data = await resolvePersonalPaymentForApp(invoiceId, token);
      return res.json(data);
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
    // Đơn thanh toán gói cá nhân (dùng chung endpoint confirm với app)
    if (await isPersonalPayment(invoice_id)) {
      const r = await confirmPersonalPayment({
        bankUserId: req.bankUserId,
        paymentId: invoice_id,
        token: payment_token
      });
      return res.json({
        success: true,
        balance: r.wallet_balance,
        plan: r.plan,
        duplicated: r.duplicated
      });
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

// ===== Thanh toán gói cá nhân qua QR (không gắn Invoice/Organization) =====
async function getResolvePersonal(req, res) {
  try {
    const { paymentId, token } = req.query;
    if (!paymentId || !token) {
      return res.status(400).json({ message: 'Thiếu paymentId hoặc token.' });
    }
    const data = await resolvePersonalPayment(paymentId, token);
    res.json(data);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function postConfirmPersonal(req, res) {
  try {
    const { payment_id, payment_token } = req.body;
    if (!payment_id || !payment_token) {
      return res.status(400).json({ message: 'Thiếu payment_id hoặc payment_token.' });
    }
    const result = await confirmPersonalPayment({
      bankUserId: req.bankUserId,
      paymentId: payment_id,
      token: payment_token
    });
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

module.exports = {
  postRegister,
  postLogin,
  getWallet,
  postTopup,
  getTransactions,
  getResolvePayment,
  postConfirmPayment,
  getTopupLimits,
  getResolvePersonal,
  postConfirmPersonal
};
