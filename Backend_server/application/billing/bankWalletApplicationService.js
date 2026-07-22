const bankWallet = require('../../services/bankWalletService');
const personalPayment = require('../../services/personalPaymentService');
const bankRepository = require('../../repositories/bankRepository');
const { runBillingCommand } = require('./runBillingCommand');

async function applyBankRefund({ refund, payment }, options = {}) {
  const key = `refund-bank-${payment._id}`;
  const existing = await bankRepository.findTransactionByIdempotency(key);
  if (existing) {
    return {
      status: 'COMPLETED',
      provider_refund_id: String(existing._id),
      provider_status: 'SUCCESS',
      response: { duplicated: true, balance_after: existing.balance_after }
    };
  }
  const paymentTransaction = await bankRepository.findLatestPaymentForInvoice(
    payment.invoice_id
  );
  if (!paymentTransaction) {
    throw Object.assign(new Error('Không tìm thấy giao dịch TPTP gốc.'), {
      status: 409,
      code: 'TPTP_PAYMENT_TRANSACTION_NOT_FOUND'
    });
  }
  const amount = Math.abs(Number(refund.amount));
  const refundTransaction = await runBillingCommand(async (session) => {
    const wallet = await bankRepository.creditWallet(
      paymentTransaction.bank_user_id,
      amount,
      { session }
    );
    if (!wallet) throw new Error('Không tìm thấy ví TPTP.');
    try {
      return await bankRepository.createTransaction({
        bank_user_id: paymentTransaction.bank_user_id,
        type: 'REFUND',
        amount,
        balance_after: wallet.balance,
        invoice_id: payment.invoice_id,
        invoice_number: paymentTransaction.invoice_number,
        description: `Hoàn tiền ${paymentTransaction.invoice_number || payment._id}`,
        idempotency_key: key
      }, { session });
    } catch (error) {
      if (!session) {
        await bankRepository.creditWalletById(wallet._id, -amount).catch(() => {});
      }
      throw error;
    }
  }, options);
  return {
    status: 'COMPLETED',
    provider_refund_id: String(refundTransaction._id),
    provider_status: 'SUCCESS',
    response: { balance_after: refundTransaction.balance_after }
  };
}

module.exports = {
  TOPUP_MIN: bankWallet.TOPUP_MIN,
  TOPUP_MAX: bankWallet.TOPUP_MAX,
  registerBankUser: bankWallet.registerBankUser,
  loginBankUser: bankWallet.loginBankUser,
  getWalletSummary: bankWallet.getWalletSummary,
  topUpWallet: bankWallet.topUpWallet,
  resolvePaymentFromQr: bankWallet.resolvePaymentFromQr,
  confirmBankPayment: bankWallet.confirmBankPayment,
  listTransactions: bankWallet.listTransactions,
  isPersonalPayment: personalPayment.isPersonalPayment,
  resolvePersonalPaymentForApp: personalPayment.resolvePersonalPaymentForApp,
  resolvePersonalPayment: personalPayment.resolvePersonalPayment,
  confirmPersonalPayment: personalPayment.confirmPersonalPayment,
  applyBankRefund
};
