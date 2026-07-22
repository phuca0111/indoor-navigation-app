function requiresEmailVerification(user) {
  if (String(process.env.EMAIL_VERIFICATION_REQUIRED || '').toLowerCase() !== 'true') return false;
  if (user?.email_verified_at) return false;
  const enforceAfter = process.env.EMAIL_VERIFICATION_ENFORCE_AFTER;
  if (!enforceAfter) return false;
  const cutoff = new Date(enforceAfter);
  if (Number.isNaN(cutoff.getTime())) return false;
  return !!user?.createdAt && new Date(user.createdAt).getTime() >= cutoff.getTime();
}

module.exports = { requiresEmailVerification };
