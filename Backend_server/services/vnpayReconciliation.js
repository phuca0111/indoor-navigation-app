function validateVnpayBusinessData(params, invoice, expectedTerminal = process.env.VNPAY_TMN_CODE) {
  const expectedAmount = Math.round(
    (Number(invoice.amount) - Number(invoice.discount_amount || 0) + Number(invoice.tax_amount || 0)) * 100
  );
  if (Number(params.vnp_Amount) !== expectedAmount) return { ok: false, code: '04', message: 'Invalid amount' };
  if (String(params.vnp_CurrCode || 'VND').toUpperCase() !== String(invoice.currency || 'VND').toUpperCase()) {
    return { ok: false, code: '04', message: 'Invalid currency' };
  }
  if (expectedTerminal && params.vnp_TmnCode !== expectedTerminal) {
    return { ok: false, code: '97', message: 'Invalid terminal' };
  }
  if (!params.vnp_TransactionNo) return { ok: false, code: '04', message: 'Missing provider reference' };
  return { ok: true };
}

module.exports = { validateVnpayBusinessData };
