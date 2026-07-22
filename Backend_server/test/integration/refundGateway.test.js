const mongoose = require('mongoose');
const User = require('../../models/User');
const BankUser = require('../../models/BankUser');
const BankWallet = require('../../models/BankWallet');
const BankTransaction = require('../../models/BankTransaction');
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const Refund = require('../../models/Refund');
const DomainEvent = require('../../models/DomainEvent');
const { refundPayment } = require('../../services/refundService');
const {
  buildRefundSecureHash
} = require('../../services/paymentGateways/vnpayGateway');

describe('Refund gateway workflow', () => {
  const prefix = `refund-gw-${Date.now()}`;
  let admin;
  let bankUser;
  let invoice;
  let payment;

  beforeAll(async () => {
    require('dotenv').config();
    const uri =
      process.env.MONGO_URI || 'mongodb://localhost:27017/HeThongBanDoTotNghiep';
    if (mongoose.connection.readyState === 0) await mongoose.connect(uri);
    admin = await User.findOne({ role: 'SUPER_ADMIN', is_active: { $ne: false } });
    bankUser = await BankUser.create({
      email: `${prefix}@test.local`,
      password: 'not-a-real-login-password',
      full_name: 'Refund Test'
    });
    await BankWallet.create({ bank_user_id: bankUser._id, balance: 50000 });
    invoice = await Invoice.create({
      invoice_number: prefix,
      status: 'PAID',
      plan: 'PRO',
      amount: 120000,
      paid_at: new Date(),
      idempotency_key: prefix
    });
    const paymentTx = await BankTransaction.create({
      bank_user_id: bankUser._id,
      type: 'PAYMENT',
      amount: -120000,
      balance_after: 50000,
      invoice_id: invoice._id,
      invoice_number: invoice.invoice_number,
      idempotency_key: `${prefix}:pay`
    });
    payment = await Payment.create({
      invoice_id: invoice._id,
      amount: 120000,
      method: 'TPTP',
      status: 'SUCCESS',
      paid_at: new Date(),
      external_ref: `TPTP-${invoice.invoice_number}-${paymentTx._id}`,
      idempotency_key: `${prefix}:ledger`
    });
  });

  afterAll(async () => {
    await DomainEvent.deleteMany({ event_key: new RegExp(String(payment?._id || prefix)) });
    await Refund.deleteMany({ payment_id: payment?._id });
    await Payment.deleteMany({
      $or: [{ _id: payment?._id }, { 'metadata.refund_of': String(payment?._id) }]
    });
    await BankTransaction.deleteMany({ bank_user_id: bankUser?._id });
    await BankWallet.deleteMany({ bank_user_id: bankUser?._id });
    await Invoice.deleteMany({ invoice_number: prefix });
    await BankUser.deleteMany({ _id: bankUser?._id });
  });

  test('TPTP hoàn ví đúng một lần và workflow idempotent', async () => {
    const first = await refundPayment(payment._id, {
      created_by: admin._id,
      note: 'TPTP refund test'
    });
    const second = await refundPayment(payment._id, {
      created_by: admin._id,
      note: 'TPTP refund test'
    });
    const wallet = await BankWallet.findOne({ bank_user_id: bankUser._id });
    const refundTx = await BankTransaction.find({
      bank_user_id: bankUser._id,
      type: 'REFUND'
    });

    expect(first.refund_request.status).toBe('COMPLETED');
    expect(second.duplicated).toBe(true);
    expect(wallet.balance).toBe(170000);
    expect(refundTx).toHaveLength(1);
  });

  test('VNPay refund signature ổn định theo chuỗi pipe', () => {
    const params = {
      vnp_RequestId: 'req',
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: 'TMN',
      vnp_TransactionType: '02',
      vnp_TxnRef: 'INV',
      vnp_Amount: 10000,
      vnp_TransactionNo: '123',
      vnp_TransactionDate: '20260721090000',
      vnp_CreateBy: 'admin',
      vnp_CreateDate: '20260721090100',
      vnp_IpAddr: '127.0.0.1',
      vnp_OrderInfo: 'refund'
    };
    expect(buildRefundSecureHash(params, 'secret')).toBe(
      buildRefundSecureHash({ ...params }, 'secret')
    );
    expect(buildRefundSecureHash({ ...params, vnp_Amount: 20000 }, 'secret')).not.toBe(
      buildRefundSecureHash(params, 'secret')
    );
  });
});
