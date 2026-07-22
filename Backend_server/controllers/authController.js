const jwt = require('jsonwebtoken');
const {
  login: loginUseCase,
  completeTwoFactor,
  unlockAuthenticatedSession,
  registerPublic: registerPublicUseCase,
  createManagedUser,
  requestPasswordResetDelivery,
  resetPassword: resetPasswordUseCase,
  googleStatus: getGoogleStatus,
  startGoogleOAuth,
  completeGoogleOAuth
} = require('../application/identity/authApplicationService');
const {
  issueAuthSession,
  refreshSession,
  logout: logoutUseCase,
  revokeAll
} = require('../application/identity/sessionApplicationService');
const { ActorContext } = require('../application/identity/ActorContext');
const { validatePasswordStrength, validatePasswordMinLength } = require('../utils/passwordPolicy');
const { validateFullName } = require('../utils/fullNamePolicy');

function context(req) {
  const actor = req.actorContext || ActorContext.fromRequest(req);
  return {
    req,
    principal: req.effectivePrincipal || null,
    actorUserId: actor.userId,
    ipAddress: actor.ipAddress
  };
}

function shouldExposeResetToken({ emailSent }) {
  if (process.env.NODE_ENV === 'production' || emailSent) return false;
  if (process.env.AUTH_RESET_TOKEN_IN_RESPONSE === 'true') return true;
  if (process.env.AUTH_RESET_TOKEN_IN_RESPONSE === 'false') return false;
  return true;
}

function sendError(res, error, fallback = 'Lỗi máy chủ.') {
  return res.status(error.status || 500).json({
    message: error.message || fallback,
    code: error.code,
    usage: error.usage
  });
}

function validateRegisterInput(fullName, email, password, confirmPassword) {
  const errors = [
    ...validateFullName(fullName),
    ...validatePasswordStrength(password)
  ];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email không hợp lệ.');
  if (password !== confirmPassword) errors.push('Xác nhận mật khẩu không khớp.');
  return errors;
}

async function registerPublic(req, res) {
  try {
    const { fullName, email, password, confirmPassword } = req.body || {};
    const errors = validateRegisterInput(fullName, email, password, confirmPassword);
    if (errors.length) return res.status(400).json({ message: 'Dữ liệu không hợp lệ.', errors });
    const result = await registerPublicUseCase({ fullName, email, password }, context(req));
    const { user, session } = result;
    return res.status(201).json({
      message: 'Đăng ký thành công!',
      ...session,
      user: { ...session.user, plan: user.plan, is_active: user.is_active }
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function register(req, res) {
  try {
    const passwordErrors = req.user?.role === 'SUPER_ADMIN'
      ? validatePasswordMinLength(req.body?.password)
      : validatePasswordStrength(req.body?.password);
    const nameErrors = validateFullName(req.body?.full_name);
    if (passwordErrors.length || nameErrors.length) {
      return res.status(400).json({
        message: 'Dữ liệu tài khoản không hợp lệ.',
        errors: [...passwordErrors, ...nameErrors]
      });
    }
    const user = await createManagedUser(req.body || {}, context(req));
    return res.status(201).json({
      message: 'Tạo tài khoản thành công!',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        full_name: user.full_name,
        organization_id: user.organization_id
      }
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function login(req, res) {
  try {
    const result = await loginUseCase(req.body || {}, context(req));
    if (!result.ok) {
      const messages = {
        INVALID_CREDENTIALS: 'Thông tin đăng nhập không hợp lệ.',
        EMAIL_VERIFICATION_REQUIRED: 'Vui lòng xác minh email trước khi đăng nhập.',
        TWO_FACTOR_REQUIRED: 'Cần mã xác thực hai bước.'
      };
      return res.status(result.status || 401).json({
        message: result.message || messages[result.code] || 'Không thể đăng nhập.',
        code: result.code,
        challengeId: result.challengeId,
        expiresAt: result.expiresAt
      });
    }
    return res.status(200).json({ message: 'Đăng nhập thành công!', ...result.session });
  } catch (error) {
    return sendError(res, error);
  }
}

async function refresh(req, res) {
  try {
    if (!req.body?.refreshToken) return res.status(400).json({ message: 'Thiếu refresh token!' });
    const result = await refreshSession(req.body.refreshToken, context(req));
    if (!result.ok) {
      return res.status(401).json({
        message: 'Refresh token không hợp lệ hoặc đã hết hạn!',
        code: result.code
      });
    }
    return res.status(200).json({ token: result.token, refreshToken: result.refreshToken });
  } catch (error) {
    return sendError(res, error);
  }
}

async function logout(req, res) {
  try {
    let claims = {};
    const token = req.headers.authorization?.split(' ')[1];
    if (token) claims = jwt.decode(token) || {};
    await logoutUseCase({
      rawToken: req.body?.refreshToken,
      userId: claims.userId,
      tokenId: claims.jti,
      accessClaims: claims
    }, context(req));
    return res.status(200).json({ message: 'Đăng xuất thành công!' });
  } catch (error) {
    return sendError(res, error);
  }
}

async function logoutAll(req, res) {
  try {
    const result = await revokeAll(req.user.userId, context(req));
    return res.status(200).json({
      message: 'Đã thu hồi mọi phiên đăng nhập.',
      revoked_count: result.revokedCount,
      session_version: result.sessionVersion
    });
  } catch (error) {
    return sendError(res, error);
  }
}

async function completeTwoFactorLogin(req, res) {
  try {
    const result = await completeTwoFactor(req.body || {}, context(req));
    if (!result.ok) {
      return res.status(result.status || 401).json({
        message: result.message || 'Mã xác thực không hợp lệ.',
        code: result.code
      });
    }
    return res.status(200).json({ message: 'Đăng nhập thành công!', ...result.session });
  } catch (error) {
    return sendError(res, error);
  }
}

async function forgotPassword(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Email không hợp lệ.' });
    }
    const generic = { message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.' };
    const issued = await requestPasswordResetDelivery(email, context(req));
    if (!issued.issued) return res.status(200).json(generic);
    const body = { ...generic, ...(issued.emailSent ? { emailSent: true } : {}) };
    if (shouldExposeResetToken({ emailSent: issued.emailSent })) {
      body.resetToken = issued.rawToken;
      body.expiresAt = issued.expiresAt;
    }
    return res.status(200).json(body);
  } catch (error) {
    return sendError(res, error);
  }
}

async function resetPassword(req, res) {
  try {
    const { token, newPassword, confirmPassword } = req.body || {};
    if (!token) return res.status(400).json({ message: 'Thiếu token đặt lại mật khẩu.', code: 'RESET_TOKEN_MISSING' });
    const errors = validatePasswordStrength(newPassword);
    if (errors.length) return res.status(400).json({ message: 'Mật khẩu mới không hợp lệ.', errors });
    if (newPassword !== confirmPassword) return res.status(400).json({ message: 'Xác nhận mật khẩu không khớp.' });
    if (!await resetPasswordUseCase(token, newPassword, context(req))) {
      return res.status(400).json({ message: 'Token không hợp lệ hoặc đã hết hạn.', code: 'RESET_TOKEN_INVALID' });
    }
    return res.status(200).json({ message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.' });
  } catch (error) {
    return sendError(res, error);
  }
}

async function unlockSession(req, res) {
  const user = await unlockAuthenticatedSession(
    req.user?.userId,
    req.body?.password,
    context(req)
  );
  if (!user) return res.status(401).json({ success: false, message: 'Invalid password' });
  return res.status(200).json({
    success: true,
    unlockUser: { id: String(user._id), email: user.email }
  });
}

function googleStatus(req, res) {
  return res.status(200).json(getGoogleStatus());
}

function issueAuthSessionCompatibility(user, req) {
  return issueAuthSession(user, context(req));
}

function googleAuthStart(req, res) {
  try {
    const result = startGoogleOAuth();
    if (req.query?.format === 'json' || req.headers.accept?.includes('application/json')) {
      return res.status(200).json(result);
    }
    return res.redirect(result.url);
  } catch (error) {
    return sendError(res, error);
  }
}

async function googleAuthCallback(req, res) {
  try {
    const result = await completeGoogleOAuth(req.query || {}, context(req));
    if (!result.ok) return res.redirect(`/login#google=0&error=${encodeURIComponent(result.code)}`);
    return res.redirect(
      `/login#token=${encodeURIComponent(result.session.token)}` +
      `&refreshToken=${encodeURIComponent(result.session.refreshToken)}&google=1`
    );
  } catch (error) {
    return res.redirect(`/login#google=0&error=${encodeURIComponent(error.code || 'oauth_failed')}`);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  unlockSession,
  registerPublic,
  forgotPassword,
  resetPassword,
  completeTwoFactorLogin,
  issueAuthSession: issueAuthSessionCompatibility,
  googleStatus,
  googleAuthStart,
  googleAuthCallback
};
