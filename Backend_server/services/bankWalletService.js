// Phase 5.8 — Ví ảo + giao dịch TPTPbank
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const BankUser = require('../models/BankUser');
const BankWallet = require('../models/BankWallet');
const BankTransaction = require('../models/BankTransaction');
const Invoice = require('../models/Invoice');
const { getPlanPrice } = require('../config/planPricing');
const { completeCheckoutPayment } = require('./paymentCheckout');
const { assertPaymentAccess, consumePaymentNonce } = require('./paymentSessionGuard');

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

async function ensureWallet(bankUserId) {
  let wallet = await BankWallet.findOne({ bank_user_id: bankUserId });
  if (!wallet) {
    wallet = await BankWallet.create({ bank_user_id: bankUserId, balance: 0 });
  }
  return wallet;
}

async function registerBankUser({ email, phone, password, fullName }) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : '';
  const normalizedPhone = phone ? String(phone).trim() : '';
  if (!normalizedEmail && !normalizedPhone) {
    throw Object.assign(new Error('Cần email hoặc số điện thoại.'), { status: 400 });
  }
  if (!password || password.length < 6) {
    throw Object.assign(new Error('Mật khẩu phải có ít nhất 6 ký tự.'), { status: 400 });
  }
  if (normalizedEmail) {
    const exists = await BankUser.findOne({ email: normalizedEmail });
    if (exists) throw Object.assign(new Error('Email đã được đăng ký.'), { status: 400 });
  }
  if (normalizedPhone) {
    const exists = await BankUser.findOne({ phone: normalizedPhone });
    if (exists) throw Object.assign(new Error('Số điện thoại đã được đăng ký.'), { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = await BankUser.create({
    email: normalizedEmail || undefined,
    phone: normalizedPhone || undefined,
    password: hashed,
    full_name: fullName ? String(fullName).trim() : ''
  });
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
  const user = normalizedEmail
    ? await BankUser.findOne({ email: normalizedEmail })
    : await BankUser.findOne({ phone: normalizedPhone });
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
  const user = await BankUser.findById(bankUserId).select('full_name email phone').lean();
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

async function topUpWallet(bankUserId, amount, idempotencyKey = '') {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < TOPUP_MIN || value > TOPUP_MAX) {
    throw Object.assign(
      new Error(`Số tiền nạp phải từ ${TOPUP_MIN.toLocaleString('vi-VN')} đến ${TOPUP_MAX.toLocaleString('vi-VN')} VND.`),
      { status: 400 }
    );
  }

  if (idempotencyKey) {
    const dup = await BankTransaction.findOne({ idempotency_key: idempotencyKey });
    if (dup) {
      const wallet = await BankWallet.findOne({ bank_user_id: bankUserId });
      return { wallet, transaction: dup, duplicated: true };
    }
  }

  const wallet = await ensureWallet(bankUserId);
  wallet.balance = Number(wallet.balance) + value;
  await wallet.save();

  const tx = await BankTransaction.create({
    bank_user_id: bankUserId,
    type: 'TOPUP',
    amount: value,
    balance_after: wallet.balance,
    description: `Nạp tiền ${value.toLocaleString('vi-VN')} VND`,
    idempotency_key: idempotencyKey || `topup-${bankUserId}-${Date.now()}`
  });

  return { wallet, transaction: tx, duplicated: false };
}

async function resolvePaymentFromQr({ invoiceId, token }) {
  const { invoice } = await assertPaymentAccess(invoiceId, token);
  const Organization = require('../models/Organization');
  const org = await Organization.findById(invoice.organization_id).select('name slug').lean();
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
  const wallet = await ensureWallet(bankUserId);

  if (wallet.balance < amount) {
    throw Object.assign(
      new Error(`Số dư không đủ. Cần ${amount.toLocaleString('vi-VN')} VND, hiện có ${wallet.balance.toLocaleString('vi-VN')} VND.`),
      { status: 400, code: 'INSUFFICIENT_BALANCE' }
    );
  }

  const payKey = `pay-bank-${invoice.invoice_number}-${bankUserId}`;
  const existingTx = await BankTransaction.findOne({ idempotency_key: payKey });
  if (existingTx && invoice.status === 'PAID') {
    const sub = await completeCheckoutPayment({
      invoice,
      externalRef: `TPTP-${invoice.invoice_number}`,
      provider: 'TPTPPAY',
      userId: payload.userId,
      note: 'TPTPbank — thanh toán (idempotent)'
    });
    return { wallet, transaction: existingTx, payment: sub, duplicated: true };
  }

  wallet.balance = Number(wallet.balance) - amount;
  await wallet.save();

  const tx = await BankTransaction.create({
    bank_user_id: bankUserId,
    type: 'PAYMENT',
    amount: -amount,
    balance_after: wallet.balance,
    invoice_id: invoice._id,
    invoice_number: invoice.invoice_number,
    description: `Thanh toán ${invoice.invoice_number}`,
    idempotency_key: payKey
  });

  const payment = await completeCheckoutPayment({
    invoice,
    externalRef: `TPTP-${invoice.invoice_number}-${tx._id}`,
    provider: 'TPTPPAY',
    userId: payload.userId,
    note: 'TPTPbank — xác nhận thanh toán QR'
  });

  await consumePaymentNonce(invoice);

  return { wallet, transaction: tx, payment, duplicated: false };
}

async function listTransactions(bankUserId, limit = 20) {
  return BankTransaction.find({ bank_user_id: bankUserId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
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
  listTransactions
};
