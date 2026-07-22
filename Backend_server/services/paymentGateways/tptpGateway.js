const {
  applyBankRefund
} = require('../../application/billing/bankWalletApplicationService');

async function applyRefund({ refund, payment }) {
  return applyBankRefund({ refund, payment });
}

module.exports = { applyRefund };
