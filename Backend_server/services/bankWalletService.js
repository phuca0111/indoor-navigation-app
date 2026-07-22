// Phase 5.8 — Ví ảo + giao dịch TPTPbank
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bankRepository = require('../repositories/bankRepository');
const invoiceRepository = require('../repositories/invoiceRepository');
const { getPlanPrice } = require('../config/planPricing');
const { completeCheckoutPayment } = require('./paymentCheckout');
const { assertPaymentAccess } = require('./paymentSessionGuard');
const { runBillingCommand } = require('../application/billing/runBillingCommand');

const TOPUP_MIN = Number(process.env.TPTP_TOPUP_MIN || 10000);
const TOPUP_MAX = Number(process.env.TPTP_TOPUP_MAX || 100000000);
const BANK_JWT_EXPIRES = process.env.TPTP_BANK_JWT_EXPIRES || '7d';

function getBankJwtSecret() {
  const secret = process.env.TPTP_BANK_JWT_SECRET || `${process.env.JWT_SECRET || ''}_tptp_bank`;
  if (!secret || secret.length < 16) {
    throw Object.assign(new Error('TPTP_BANK_JWT_SECRET chưa cấu hình.'), { status: 500 });
  }
  return secret;
}

function signBankToken(userId) {
  return jwt.sign({ bankUserId: String(userId), type: 'TPTP_BANK' }, getBankJwtSecret(), {
    expiresIn: BANK_JWT_EXPIRES
  });
}

function verifyBankToken(token) {
  try {
    const payload = jwt.verify(token, getBankJwtSecret());
    if (payload.type !== 'TPTP_BANK' || !payload.bankUserId) {
      return { ok: false, message: 'Token ngân hàng không hợp lệ.' };
    }
    return { ok: true, bankUserId: payload.bankUserId };
  } catch (e) {
    return { ok: false, message: e.name === 'TokenExpiredError' ? 'Phiên đăng nhập hết hạn.' : 'Token không hợp lệ.' };
  }
}

async function ensureWallet(bankUserId, options = {}) {
  return bankRepository.ensureWallet(bankUserId, options);
}

async function debitWalletAtomic(bankUserId, amount, options = {}) {
  const wallet = await bankRepository.debitWallet(bankUserId, amount, options);
  if (wallet) return wallet;

  const current = await ensureWallet(bankUserId);
  throw Object.assign(
    new Error(
      `Số dư không đủ. Cần ${amount.toLocaleString('vi-VN')} VND, ` +
      `hiện có ${Number(current.balance || 0).toLocaleString('vi-VN')} VND.`
    ),
    { status: 400, code: 'INSUFFICIENT_BALANCE' }
  );
}

async function executeDebitWithCompensation({ debit, record, compensate }) {
  let debitResult;
  try {
    debitResult = await debit();
    const transaction = await record(debitResult);
    return { debitResult, transaction };
  } catch (error) {
    if (debitResult) await compensate(debitResult).catch(() => {});
    throw error;
  }
}

async function claimInvoicePayment(invoiceId, payKey) {
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000);
  return invoiceRepository.claimPayment(invoiceId, payKey, staleBefore);
}

async function releaseInvoicePaymentClaim(invoiceId, payKey) {
  await invoiceRepository.releasePaymentClaim(invoiceId, payKey);
}

async function registerBankUser({ email, phone, password, fullName }) {
  await bankRepository.ensureUserIndexes();
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  const normalizedPhone = phone ? String(phone).trim() : '';
  if (!normalizedEmail && !normalizedPhone) {
    throw Object.assign(new Error('Cần email hoặc số điện thoại.'), { status: 400 });
  }
  if (!password || password.length < 6) {
    throw Object.assign(new Error('Mật khẩu phải có ít nhất 6 ký tự.'), { status: 400 });
  }
  if (normalizedEmail) {
    const exists = await bankRepository.findUserByIdentity({ email: normalizedEmail });
    if (exists) throw Object.assign(new Error('Email đã được đăng ký.'), { status: 400 });
  }
  if (normalizedPhone) {
    const exists = await bankRepository.findUserByIdentity({ phone: normalizedPhone });
    if (exists) throw Object.assign(new Error('Số điện thoại đã được đăng ký.'), { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const payload = {
    password: hashed,
    full_name: fullName ? String(fullName).trim() : ''
  };
  if (normalizedEmail) payload.email = normalizedEmail;
  if (normalizedPhone) payload.phone = normalizedPhone;

  const user = await bankRepository.createUser(payload);
  await ensureWallet(user._id);
  const token = signBankToken(user._id);
  return {
    user: {
      id: String(user._id),
      email: user.email || null,
      phone: user.phone || null,
      full_name: user.full_name || ''
    },
    token
  };
}

async function loginBankUser({ email, phone, password }) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  const normalizedPhone = phone ? String(phone).trim() : '';
  const user = await bankRepository.findUserByIdentity({
    email: normalizedEmail,
    phone: normalizedPhone
  });
  if (!user || !user.is_active) {
    throw Object.assign(new Error('Tài khoản không tồn tại hoặc đã bị khóa.'), { status: 401 });
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    throw Object.assign(new Error('Mật khẩu không đúng.'), { status: 401 });
  }
  await ensureWallet(user._id);
  const token = signBankToken(user._id);
  return {
    user: {
      id: String(user._id),
      email: user.email || null,
      phone: user.phone || null,
      full_name: user.full_name || ''
    },
    token
  };
}

async function getWalletSummary(bankUserId) {
  const wallet = await ensureWallet(bankUserId);
  const user = await bankRepository.findUserById(bankUserId);
  return {
    balance: Number(wallet.balance || 0),
    currency: wallet.currency || 'VND',
    user: user
      ? {
          id: String(user._id),
          email: user.email || null,
          phone: user.phone || null,
          full_name: user.full_name || ''
        }
      : null
  };
}

async function topUpWalletWithinUnitOfWork(
  bankUserId,
  amount,
  idempotencyKey = '',
  session = null
) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < TOPUP_MIN || value > TOPUP_MAX) {
    throw Object.assign(
      new Error(`Số tiền nạp phải từ ${TOPUP_MIN.toLocaleString('vi-VN')} đến ${TOPUP_MAX.toLocaleString('vi-VN')} VND.`),
      { status: 400 }
    );
  }

  if (idempotencyKey) {
    const dup = await bankRepository.findTransactionByIdempotency(
      idempotencyKey,
      { session }
    );
    if (dup) {
      const wallet = await bankRepository.findWallet(bankUserId, { session });
      return { wallet, transaction: dup, duplicated: true };
    }
  }

  await ensureWallet(bankUserId, { session });
  const wallet = await bankRepository.creditWallet(bankUserId, value, { session });

  const tx = await bankRepository.createTransaction({
    bank_user_id: bankUserId,
    type: 'TOPUP',
    amount: value,
    balance_after: wallet.balance,
    description: `Nạp tiền ${value.toLocaleString('vi-VN')} VND`,
    idempotency_key: idempotencyKey || `topup-${bankUserId}-${Date.now()}`
  }, { session });

  return { wallet, transaction: tx, duplicated: false };
}

async function topUpWallet(bankUserId, amount, idempotencyKey = '', options = {}) {
  return runBillingCommand(
    (session) => topUpWalletWithinUnitOfWork(
      bankUserId,
      amount,
      idempotencyKey,
      session
    ),
    options
  );
}

async function resolvePaymentFromQr({ invoiceId, token }) {
  const { invoice } = await assertPaymentAccess(invoiceId, token);
  const billingOrganizationRepository = require('../repositories/billingOrganizationRepository');
  const org = await billingOrganizationRepository.findBillingOrganizationById(
    invoice.organization_id
  );
  return {
    invoice_id: String(invoice._id),
    invoice_number: invoice.invoice_number,
    amount: invoice.amount,
    currency: invoice.currency || 'VND',
    plan: invoice.plan,
    merchant: org?.name || org?.slug || 'Indoor Nav SaaS',
    status: invoice.status,
    payment_token: token
  };
}

async function confirmBankPayment({ bankUserId, invoiceId, token }) {
  const { invoice, payload } = await assertPaymentAccess(invoiceId, token);
  const amount = Number(invoice.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Số tiền hóa đơn không hợp lệ.'), {
      status: 400,
      code: 'INVALID_PAYMENT_AMOUNT'
    });
  }
  const payKey = `pay-bank-${invoice.invoice_number}-${bankUserId}`;
  const existingTx = await bankRepository.findTransactionByIdempotency(payKey);
  if (existingTx) {
    const sub = await completeCheckoutPayment({
      invoice,
      externalRef: `TPTP-${invoice.invoice_number}`,
      provider: 'TPTPPAY',
      userId: payload.userId,
      note: 'TPTPbank — thanh toán (idempotent)'
    });
    const wallet = await ensureWallet(bankUserId);
    return { wallet, transaction: existingTx, payment: sub, duplicated: true };
  }

  const claimedInvoice = await claimInvoicePayment(invoice._id, payKey);
  if (!claimedInvoice) {
    const duplicateTx = await bankRepository.findTransactionByIdempotency(payKey);
    if (duplicateTx) {
      const freshInvoice = await invoiceRepository.findById(invoice._id);
      const sub = await completeCheckoutPayment({
        invoice: freshInvoice,
        externalRef: `TPTP-${invoice.invoice_number}`,
        provider: 'TPTPPAY',
        userId: payload.userId,
        note: 'TPTPbank — thanh toán retry idempotent'
      });
      const wallet = await ensureWallet(bankUserId);
      return { wallet, transaction: duplicateTx, payment: sub, duplicated: true };
    }
    throw Object.assign(
      new Error('Giao dịch này đang được xử lý. Vui lòng chờ vài giây.'),
      { status: 409, code: 'PAYMENT_PROCESSING' }
    );
  }

  let wallet;
  let tx;
  try {
    const debit = await runBillingCommand((session) => executeDebitWithCompensation({
      debit: () => debitWalletAtomic(bankUserId, amount, { session }),
      record: (debitedWallet) => bankRepository.createTransaction({
        bank_user_id: bankUserId,
        type: 'PAYMENT',
        amount: -amount,
        balance_after: debitedWallet.balance,
        invoice_id: invoice._id,
        invoice_number: invoice.invoice_number,
        description: `Thanh toán ${invoice.invoice_number}`,
        idempotency_key: payKey
      }, { session }),
      compensate: (debitedWallet) => bankRepository.creditWalletById(
        debitedWallet._id,
        amount,
        { session }
      )
    }));
    wallet = debit.debitResult;
    tx = debit.transaction;
  } catch (err) {
    await releaseInvoicePaymentClaim(invoice._id, payKey).catch(() => {});
    throw err;
  }

  const payment = await completeCheckoutPayment({
    invoice: claimedInvoice,
    externalRef: `TPTP-${invoice.invoice_number}-${tx._id}`,
    provider: 'TPTPPAY',
    userId: payload.userId,
    note: 'TPTPbank — xác nhận thanh toán QR'
  });

  return { wallet, transaction: tx, payment, duplicated: false };
}

/**
 * Trừ ví trực tiếp cho giao dịch KHÔNG gắn Invoice (vd nâng cấp gói cá nhân).
 * Trung lập với Organization — chỉ thao tác trên ví ảo TPTPbank.
 */
async function chargeWalletDirectWithinUnitOfWork(
  { bankUserId, amount, description = '', idempotencyKey = '' },
  session = null
) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw Object.assign(new Error('Số tiền thanh toán không hợp lệ.'), { status: 400 });
  }
  if (idempotencyKey) {
    const dup = await bankRepository.findTransactionByIdempotency(
      idempotencyKey,
      { session }
    );
    if (dup) {
      const wallet = await bankRepository.findWallet(bankUserId, { session });
      return { wallet, transaction: dup, duplicated: true };
    }
  }
  const { debitResult: wallet, transaction: tx } = await executeDebitWithCompensation({
    debit: () => debitWalletAtomic(bankUserId, value, { session }),
    record: (debitedWallet) => bankRepository.createTransaction({
      bank_user_id: bankUserId,
      type: 'PAYMENT',
      amount: -value,
      balance_after: debitedWallet.balance,
      description: description || `Thanh toán ${value.toLocaleString('vi-VN')} VND`,
      idempotency_key: idempotencyKey || `charge-${bankUserId}-${Date.now()}`
    }, { session }),
    compensate: (debitedWallet) => bankRepository.creditWalletById(
      debitedWallet._id,
      value,
      { session }
    )
  });
  return { wallet, transaction: tx, duplicated: false };
}

async function chargeWalletDirect(input, options = {}) {
  return runBillingCommand(
    (session) => chargeWalletDirectWithinUnitOfWork(input, session),
    options
  );
}

async function listTransactions(bankUserId, limit = 20) {
  return bankRepository.listTransactions(bankUserId, limit);
}

module.exports = {
  TOPUP_MIN,
  TOPUP_MAX,
  verifyBankToken,
  registerBankUser,
  loginBankUser,
  getWalletSummary,
  topUpWallet,
  resolvePaymentFromQr,
  confirmBankPayment,
  chargeWalletDirect,
  chargeWalletDirectWithinUnitOfWork,
  executeDebitWithCompensation,
  listTransactions
};
