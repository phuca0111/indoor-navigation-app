// Phase 5.8 — JWT middleware cho app TPTPbank
const { verifyBankToken } = require('../services/bankWalletService');

function bankAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ message: 'Chưa đăng nhập TPTPbank.' });
  }
  const verified = verifyBankToken(token);
  if (!verified.ok) {
    return res.status(401).json({ message: verified.message });
  }
  req.bankUserId = verified.bankUserId;
  next();
}

module.exports = { bankAuth };
