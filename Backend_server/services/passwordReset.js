/**
 * Password reset self-service (Phase 7).
 * Token raw chỉ trả client / email sandbox — DB chỉ lưu SHA-256 hash.
 */
const crypto = require('crypto');
const User = require('../models/User');

const RESET_TTL_MS = Number(process.env.AUTH_RESET_TOKEN_TTL_MS) || 60 * 60 * 1000; // 1 giờ

function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function shouldExposeResetToken(opts) {
  opts = opts || {};
  // Production: không bao giờ trả raw token ra JSON
  if (process.env.NODE_ENV === 'production') return false;
  // SMTP đã gửi mail thành công → không lộ token trên web
  if (opts.emailSent) return false;
  if (process.env.AUTH_RESET_TOKEN_IN_RESPONSE === 'true') return true;
  if (process.env.AUTH_RESET_TOKEN_IN_RESPONSE === 'false') return false;
  // Dev mặc định: trả token khi chưa gửi được email (sandbox)
  return true;
}

/**
 * Tạo token reset cho user; ghi hash + expires vào User.
 * @returns {{ rawToken: string, expiresAt: Date }}
 */
async function issuePasswordResetToken(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  user.password_reset_token_hash = hashToken(rawToken);
  user.password_reset_expires = expiresAt;
  await user.save();
  return { rawToken, expiresAt };
}

/**
 * Tìm user theo raw token còn hạn.
 */
async function findUserByValidResetToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = hashToken(rawToken);
  const user = await User.findOne({
    password_reset_token_hash: tokenHash,
    password_reset_expires: { $gt: new Date() }
  }).select('+password_reset_token_hash +password_reset_expires');
  return user;
}

async function clearPasswordResetFields(user) {
  // $unset chắc chắn xóa field (tránh null vẫn match nhầm)
  await User.updateOne(
    { _id: user._id },
    { $unset: { password_reset_token_hash: 1, password_reset_expires: 1 } }
  );
  user.password_reset_token_hash = undefined;
  user.password_reset_expires = undefined;
}

/** Tăng session_version → mọi access JWT cũ (sv khác) bị middleware từ chối. */
async function revokeAllAccessSessions(userId) {
  const user = await User.findById(userId).select('session_version');
  if (!user) {
    throw new Error('Không tìm thấy user để thu hồi phiên');
  }
  user.session_version = (Number(user.session_version) || 0) + 1;
  await user.save();
  console.log(`[Auth] sessions revoked for ${user._id} → session_version=${user.session_version}`);
  return user.session_version;
}

module.exports = {
  RESET_TTL_MS,
  hashToken,
  shouldExposeResetToken,
  issuePasswordResetToken,
  findUserByValidResetToken,
  clearPasswordResetFields,
  revokeAllAccessSessions
};
