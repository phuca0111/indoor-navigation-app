const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const identity = require('../../repositories/identityRepository');
const memberships = require('../../repositories/membershipRepository');
const activities = require('../../repositories/activityLogRepository');
const outbox = require('../../repositories/outboxRepository');
const challenges = require('../../repositories/identityChallengeRepository');
const { createChallenge, consumeChallenge } = require('../../services/identityChallengeService');
const { getOtpProvider } = require('../../services/otpProvider');
const { requiresEmailVerification } = require('../../services/identityPolicy');
const { allowLegacyPlaintextPassword, looksLikeBcryptHash } = require('../../services/passwordAuth');
const { evaluateAuthenticationEligibility, TENANT_ROLES } = require('./authenticationEligibilityPolicy');
const { issueAuthSession, revokeAll } = require('./sessionApplicationService');
const { runIdentityCommand } = require('./runIdentityCommand');
const {
  evaluateCreateUserQuota,
  isIdentityQuotaLocked
} = require('./identityQuotaPolicy');
const { normalizeFullName } = require('../../utils/fullNamePolicy');
const {
  isGoogleEnabled,
  getAuthUrl,
  exchangeCode
} = require('../../services/googleAuth');
const { createOAuthState, verifyOAuthState } = require('../../services/oauthState');
const {
  isSmtpConfigured,
  buildPasswordResetLink,
  sendPasswordResetEmail
} = require('../../services/mailService');

async function verifyPassword(user, candidate) {
  if (!user?.password || typeof candidate !== 'string') return false;
  if (looksLikeBcryptHash(user.password)) return bcrypt.compare(candidate, user.password);
  return allowLegacyPlaintextPassword() && user.password === candidate;
}

async function hardenLegacyPassword(user, candidate, context) {
  await runIdentityCommand(async (session) => {
    await identity.updateUserById(user._id, {
      $set: { password: await bcrypt.hash(candidate, 10) }
    }, { session });
    await revokeAll(user._id, {
      actorUserId: user._id,
      ipAddress: context.ipAddress
    }, 'PASSWORD_CHANGED', { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'CHANGE_PASSWORD',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: { source: 'LEGACY_HASH_UPGRADE' },
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityPasswordChanged',
      event_key: `identity-password-hardened:${user._id}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      organization_id: user.organization_id || null,
      actor_user_id: user._id,
      payload: { source: 'LEGACY_HASH_UPGRADE' }
    }, { session });
  });
  return identity.findUserById(user._id);
}

async function loadEligibility(user) {
  const organization = user.organization_id
    ? await identity.findOrganizationById(user.organization_id)
    : null;
  const member = TENANT_ROLES.has(user.role) && user.organization_id
    ? await memberships.findMembership(user._id, user.organization_id)
    : null;
  const quotaLocked = organization && TENANT_ROLES.has(member?.role || user.role)
    ? await isIdentityQuotaLocked(user._id, organization)
    : false;
  const effectiveUser = member ? {
    ...user,
    role: member.role,
    organization_id: member.organization_id,
    assigned_buildings: member.building_ids
  } : user;
  return {
    ...evaluateAuthenticationEligibility({
    user: effectiveUser,
    organization,
    member,
    quotaLocked
    }),
    user: effectiveUser
  };
}

async function login({ email, password }, context) {
  let user = await identity.findUserByEmail(email);
  if (!user) {
    await bcrypt.compare(
      String(password || ''),
      '$2b$10$CwTycUXWue0Thq9StjUM0uJ8XzJp1QJ1xVvmf0h4FQSTZ3TQjY1QK'
    ).catch(() => false);
    return { ok: false, status: 401, code: 'INVALID_CREDENTIALS' };
  }
  if (!await verifyPassword(user, String(password || ''))) {
    return { ok: false, status: 401, code: 'INVALID_CREDENTIALS' };
  }
  if (!looksLikeBcryptHash(user.password)) {
    user = await hardenLegacyPassword(user, String(password || ''), context);
  }
  const eligibility = await loadEligibility(user);
  if (!eligibility.ok) return eligibility;
  if (requiresEmailVerification(user)) {
    const result = await createChallenge({
      userId: user._id,
      purpose: 'EMAIL_VERIFY',
      provider: getOtpProvider(),
      to: user.email,
      ip: context.ipAddress
    });
    return {
      ok: false,
      status: 403,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      challengeId: result.challenge._id,
      expiresAt: result.challenge.expires_at
    };
  }
  if (user.two_factor?.enabled) {
    const result = await createChallenge({
      userId: user._id,
      purpose: 'TWO_FACTOR_LOGIN',
      provider: getOtpProvider(),
      to: user.email,
      ip: context.ipAddress
    });
    return {
      ok: false,
      status: 202,
      code: 'TWO_FACTOR_REQUIRED',
      challengeId: result.challenge._id,
      expiresAt: result.challenge.expires_at
    };
  }
  return { ok: true, session: await issueAuthSession(eligibility.user, context) };
}

async function completeTwoFactor({ challengeId, code }, context) {
  const owner = await challenges.findOwner(challengeId, 'TWO_FACTOR_LOGIN');
  if (!owner) return { ok: false, code: 'CHALLENGE_INVALID' };
  const user = await identity.findUserById(owner.user_id);
  if (!user?.two_factor?.enabled) return { ok: false, code: 'TWO_FACTOR_DISABLED' };
  const eligibility = await loadEligibility(user);
  if (!eligibility.ok) return eligibility;
  return runIdentityCommand(async (session) => {
    const consumed = await consumeChallenge({
      challengeId,
      userId: owner.user_id,
      purpose: 'TWO_FACTOR_LOGIN',
      code,
      session
    });
    if (!consumed.ok) return consumed;
    return {
      ok: true,
      session: await issueAuthSession(eligibility.user, context, { session })
    };
  });
}

async function verifyAuthenticatedPassword(userId, password) {
  const user = await identity.findUserById(userId);
  if (!user || user.is_active === false) return null;
  return await verifyPassword(user, String(password || '')) ? user : null;
}

async function unlockAuthenticatedSession(userId, password, context) {
  const user = await identity.findUserById(userId);
  if (!user || user.is_active === false || !await verifyPassword(user, String(password || ''))) {
    return null;
  }
  await runIdentityCommand(async (session) => {
    await activities.recordActivity({
      user_id: user._id,
      action: 'UNLOCK_SESSION',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentitySessionUnlocked',
      event_key: `identity-session-unlocked:${user._id}:${Date.now()}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      organization_id: user.organization_id || null,
      actor_user_id: user._id,
      payload: {}
    }, { session });
  });
  return user;
}

async function registerPublic(input, context) {
  const email = String(input.email || '').trim().toLowerCase();
  return runIdentityCommand(async (session) => {
    if (await identity.findUserByEmail(email, { session })) {
      throw Object.assign(new Error('Email này đã được đăng ký rồi!'), {
        status: 400,
        code: 'EMAIL_EXISTS'
      });
    }
    const user = await identity.createUser({
      email,
      password: await bcrypt.hash(input.password, 10),
      role: 'REGISTERED_USER',
      plan: 'FREE',
      full_name: normalizeFullName(input.fullName),
      is_active: true,
      organization_id: null,
      assigned_buildings: [],
      created_by: null
    }, { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'REGISTER',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: { role: user.role, plan: user.plan },
      ip_address: context.ipAddress
    }, { session });
    await outbox.append({
      type: 'IdentityUserRegistered',
      event_key: `identity-user-registered:${user._id}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      actor_user_id: user._id,
      payload: { user_id: String(user._id), email: user.email }
    }, { session });
    return {
      user,
      session: await issueAuthSession(user, context, { session })
    };
  });
}

function dualWriteMembershipEnabled() {
  return String(process.env.IDENTITY_MEMBERSHIP_DUAL_WRITE || 'true').toLowerCase() !== 'false';
}

async function createManagedUser(input, context) {
  const actor = context.principal;
  const email = String(input.email || '').trim().toLowerCase();
  let role = input.role || 'BUILDING_ADMIN';
  let organizationId = input.organization_id || null;
  let buildingIds = Array.isArray(input.assigned_buildings) ? input.assigned_buildings : [];
  if (actor.role === 'ORG_ADMIN') {
    if (role !== 'BUILDING_ADMIN') {
      throw Object.assign(new Error('Org Admin chỉ được tạo tài khoản BUILDING_ADMIN.'), {
        status: 403,
        code: 'PERMISSION_DENIED'
      });
    }
    organizationId = actor.organizationId;
    role = 'BUILDING_ADMIN';
  }
  const platformRoles = ['SUPER_ADMIN', 'FINANCE_ADMIN', 'MARKETING_MANAGER'];
  if (platformRoles.includes(role)) {
    organizationId = null;
    buildingIds = [];
  }
  return runIdentityCommand(async (session) => {
    if (await identity.findUserByEmail(email, { session })) {
      throw Object.assign(new Error('Email này đã được đăng ký rồi!'), {
        status: 400,
        code: 'EMAIL_EXISTS'
      });
    }
    if (organizationId) {
      const organization = await identity.findOrganizationById(organizationId, { session });
      if (!organization || organization.is_active === false) {
        throw Object.assign(new Error('Organization không khả dụng.'), {
          status: 400,
          code: 'ORG_INACTIVE'
        });
      }
      const quota = await evaluateCreateUserQuota(organization);
      if (quota?.ok === false) {
        throw Object.assign(new Error(quota.message), {
          status: 403,
          code: quota.code,
          usage: quota.usage
        });
      }
      if (!await identity.buildingIdsBelongToOrganization(buildingIds, organizationId, { session })) {
        throw Object.assign(new Error('Một số tòa nhà không thuộc organization của user.'), {
          status: 400,
          code: 'BUILDING_SCOPE_INVALID'
        });
      }
    }
    const user = await identity.createUser({
      email,
      password: await bcrypt.hash(input.password, 10),
      role,
      full_name: normalizeFullName(input.full_name),
      phone: String(input.phone || '').trim(),
      organization_id: organizationId,
      assigned_buildings: role === 'BUILDING_ADMIN' ? buildingIds : [],
      is_active: true,
      created_by: actor.userId
    }, { session });
    if (organizationId && TENANT_ROLES.has(role) && dualWriteMembershipEnabled()) {
      await memberships.upsertActive({
        organization_id: organizationId,
        user_id: user._id,
        role,
        building_ids: user.assigned_buildings,
        created_by: actor.userId
      }, { session });
    }
    await activities.recordActivity({
      user_id: actor.userId,
      action: 'CREATE_USER',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      details: { role, organization_id: organizationId ? String(organizationId) : null },
      ip_address: context.ipAddress,
      organization_id: organizationId || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityUserCreated',
      event_key: `identity-user-created:${user._id}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      organization_id: organizationId,
      actor_user_id: actor.userId,
      payload: { role }
    }, { session });
    return user;
  });
}

function googleStatus() {
  return { enabled: isGoogleEnabled() };
}

function startGoogleOAuth() {
  if (!isGoogleEnabled()) {
    throw Object.assign(new Error('Google OAuth chưa được cấu hình.'), {
      status: 503,
      code: 'GOOGLE_OAUTH_DISABLED'
    });
  }
  const state = createOAuthState();
  return { state, url: getAuthUrl(state) };
}

async function completeGoogleOAuth({ code, state }, context) {
  if (!isGoogleEnabled()) {
    throw Object.assign(new Error('Google OAuth chưa được cấu hình.'), {
      status: 503,
      code: 'GOOGLE_OAUTH_DISABLED'
    });
  }
  const stateCheck = verifyOAuthState(state);
  if (!stateCheck.ok) {
    throw Object.assign(new Error('OAuth state không hợp lệ.'), {
      status: 400,
      code: stateCheck.code
    });
  }
  const profile = await exchangeCode(code);
  let user = await identity.findUserByGoogleId(profile.googleId);
  if (!user) user = await identity.findUserByEmail(profile.email);
  if (!user) {
    user = await runIdentityCommand(async (session) => {
      const created = await identity.createUser({
        email: profile.email,
        google_id: profile.googleId,
        email_verified_at: new Date(),
        full_name: profile.name || '',
        role: 'REGISTERED_USER',
        plan: 'FREE',
        is_active: true,
        organization_id: null,
        assigned_buildings: []
      }, { session });
      await activities.recordActivity({
        user_id: created._id,
        action: 'REGISTER',
        target_type: 'user',
        target_id: String(created._id),
        target: created.email,
        details: { via: 'google', role: created.role },
        ip_address: context.ipAddress
      }, { session });
      await outbox.append({
        type: 'IdentityUserRegistered',
        event_key: `identity-user-registered:${created._id}`,
        aggregate_type: 'User',
        aggregate_id: created._id,
        actor_user_id: created._id,
        payload: { via: 'google' }
      }, { session });
      return created;
    });
  } else if (!user.google_id || !user.email_verified_at) {
    user = await identity.updateUserById(user._id, {
      $set: {
        google_id: profile.googleId,
        email_verified_at: user.email_verified_at || new Date()
      }
    });
  }
  const eligibility = await loadEligibility(user);
  if (!eligibility.ok) return eligibility;
  return { ok: true, session: await issueAuthSession(eligibility.user, context) };
}

async function issuePasswordReset(email, context) {
  const user = await identity.findUserByEmail(email, { includeSecrets: true });
  if (!user || user.is_active === false) return null;
  const rawToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (Number(process.env.AUTH_RESET_TOKEN_TTL_MS) || 3600000));
  await runIdentityCommand(async (session) => {
    await identity.updateUserById(user._id, {
      $set: {
        password_reset_token_hash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        password_reset_expires: expiresAt
      }
    }, { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'PASSWORD_RESET_REQUEST',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityPasswordResetRequested',
      event_key: `identity-password-reset:${user._id}:${expiresAt.getTime()}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      organization_id: user.organization_id || null,
      actor_user_id: user._id,
      payload: { expires_at: expiresAt.toISOString() }
    }, { session });
  });
  return { user, rawToken, expiresAt };
}

async function requestPasswordResetDelivery(email, context) {
  const issued = await issuePasswordReset(email, context);
  if (!issued) return { issued: false, emailSent: false };
  let emailSent = false;
  if (isSmtpConfigured()) {
    try {
      await sendPasswordResetEmail({
        to: issued.user.email,
        resetLink: buildPasswordResetLink(issued.rawToken),
        expiresAt: issued.expiresAt
      });
      emailSent = true;
    } catch (_) {
      emailSent = false;
    }
  }
  return { ...issued, issued: true, emailSent };
}

async function resetPassword(rawToken, password, context) {
  const tokenHash = crypto.createHash('sha256').update(String(rawToken)).digest('hex');
  const user = await identity.findUserByValidResetHash(tokenHash, new Date());
  if (!user) return false;
  await runIdentityCommand(async (session) => {
    const claimed = await identity.compareAndUpdateUser(
      user._id,
      {
        password_reset_token_hash: tokenHash,
        password_reset_expires: { $gt: new Date() }
      },
      {
        $set: { password: await bcrypt.hash(password, 10) },
        $unset: { password_reset_token_hash: 1, password_reset_expires: 1 }
      },
      { session }
    );
    if (!claimed) {
      throw Object.assign(new Error('Token đã được sử dụng.'), {
        status: 400,
        code: 'RESET_TOKEN_INVALID'
      });
    }
    await revokeAll(user._id, {
      actorUserId: user._id,
      ipAddress: context.ipAddress
    }, 'PASSWORD_CHANGED', { session });
    await activities.recordActivity({
      user_id: user._id,
      action: 'PASSWORD_RESET_COMPLETE',
      target_type: 'user',
      target_id: String(user._id),
      target: user.email,
      ip_address: context.ipAddress,
      organization_id: user.organization_id || undefined
    }, { session });
    await outbox.append({
      type: 'IdentityPasswordChanged',
      event_key: `identity-password-changed:${user._id}:${Date.now()}`,
      aggregate_type: 'User',
      aggregate_id: user._id,
      organization_id: user.organization_id || null,
      actor_user_id: user._id,
      payload: { source: 'PASSWORD_RESET' }
    }, { session });
  });
  return true;
}

module.exports = {
  verifyPassword,
  loadEligibility,
  login,
  completeTwoFactor,
  verifyAuthenticatedPassword,
  unlockAuthenticatedSession,
  registerPublic,
  createManagedUser,
  googleStatus,
  startGoogleOAuth,
  completeGoogleOAuth,
  issuePasswordReset,
  requestPasswordResetDelivery,
  resetPassword
};
