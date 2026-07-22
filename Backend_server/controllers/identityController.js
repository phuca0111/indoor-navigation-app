const {
  requestChallenge,
  confirmEmail,
  enableTwoFactor,
  disableTwoFactor: disableTwoFactorUseCase,
  listSessions: listSessionsUseCase,
  revokeOwnedSession
} = require('../application/identity/identityApplicationService');

function context(req) {
  return { ipAddress: req.actorContext?.ipAddress || req.ip || '' };
}

function challengeResponse(result) {
  return {
    challengeId: result.challenge._id,
    expiresAt: result.challenge.expires_at,
    delivery: result.delivery.provider,
    message: 'Nếu kênh nhận mã khả dụng, mã xác minh đã được gửi.'
  };
}

async function requestEmailVerification(req, res) {
  try {
    const result = await requestChallenge(req.user.userId, 'EMAIL_VERIFY', context(req));
    if (result.alreadyDone) return res.status(200).json({ message: 'Email đã được xác minh.' });
    return res.status(202).json(challengeResponse(result));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function confirmEmailVerification(req, res) {
  const result = await confirmEmail({
    challengeId: req.body?.challengeId,
    code: req.body?.code,
    userId: req.user.userId
  }, context(req));
  if (!result.ok) return res.status(400).json({ message: 'Mã xác minh không hợp lệ.', code: result.code });
  return res.status(200).json({ message: 'Xác minh email thành công.' });
}

async function confirmEmailVerificationPublic(req, res) {
  const result = await confirmEmail({
    challengeId: req.body?.challengeId,
    code: req.body?.code
  }, context(req));
  if (!result.ok) return res.status(400).json({ message: 'Mã xác minh không hợp lệ.', code: result.code });
  return res.status(200).json({ message: 'Xác minh email thành công. Vui lòng đăng nhập.' });
}

async function requestTwoFactorSetup(req, res) {
  try {
    const result = await requestChallenge(req.user.userId, 'TWO_FACTOR_LOGIN', context(req));
    return res.status(202).json(challengeResponse(result));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function confirmTwoFactorSetup(req, res) {
  const result = await enableTwoFactor({
    userId: req.user.userId,
    challengeId: req.body?.challengeId,
    code: req.body?.code
  }, context(req));
  if (!result.ok) return res.status(400).json({ message: 'Mã xác minh không hợp lệ.', code: result.code });
  return res.status(200).json({
    message: 'Đã bật xác thực hai bước. Vui lòng đăng nhập lại.',
    recoveryCodes: result.recoveryCodes
  });
}

async function disableTwoFactor(req, res) {
  const ok = await disableTwoFactorUseCase({
    userId: req.user.userId,
    password: req.body?.password,
    recoveryCode: req.body?.recoveryCode
  }, context(req));
  if (!ok) return res.status(401).json({ message: 'Không thể xác minh yêu cầu tắt 2FA.' });
  return res.status(200).json({ message: 'Đã tắt xác thực hai bước. Vui lòng đăng nhập lại.' });
}

async function listSessions(req, res) {
  return res.status(200).json(await listSessionsUseCase(
    req.user.userId,
    req.headers['x-refresh-token']
  ));
}

async function revokeSession(req, res) {
  const revoked = await revokeOwnedSession(
    req.user.userId,
    req.params.sessionId,
    context(req)
  );
  if (!revoked) return res.status(404).json({ message: 'Không tìm thấy phiên đăng nhập.' });
  return res.status(200).json({ message: 'Đã thu hồi phiên đăng nhập.' });
}

module.exports = {
  requestEmailVerification,
  confirmEmailVerification,
  confirmEmailVerificationPublic,
  requestTwoFactorSetup,
  confirmTwoFactorSetup,
  disableTwoFactor,
  listSessions,
  revokeSession
};
