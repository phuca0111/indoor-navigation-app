const ALLOWED_THEMES = new Set(['system', 'light', 'dark']);

function isSafeHttpUrl(value) {
  if (value === '') return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ||
      (parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname));
  } catch (_) {
    return false;
  }
}

function validateProfilePatch(body = {}) {
  const errors = [];
  if (body.avatar_url !== undefined &&
      (typeof body.avatar_url !== 'string' || body.avatar_url.length > 2048 || !isSafeHttpUrl(body.avatar_url))) {
    errors.push('avatar_url phải là URL HTTPS hợp lệ.');
  }
  if (body.avatar_object_key !== undefined &&
      (typeof body.avatar_object_key !== 'string' ||
       body.avatar_object_key.length > 512 ||
       body.avatar_object_key.includes('..') ||
       body.avatar_object_key.startsWith('/'))) {
    errors.push('avatar_object_key không hợp lệ.');
  }
  if (body.preferences !== undefined) {
    if (!body.preferences || typeof body.preferences !== 'object' || Array.isArray(body.preferences)) {
      errors.push('preferences phải là object.');
    } else {
      const allowed = ['locale', 'timezone', 'theme'];
      if (Object.keys(body.preferences).some((key) => !allowed.includes(key))) {
        errors.push('preferences chứa trường không được phép.');
      }
      if (body.preferences.theme && !ALLOWED_THEMES.has(body.preferences.theme)) {
        errors.push('theme không hợp lệ.');
      }
    }
  }
  if (body.notification_preferences !== undefined) {
    const value = body.notification_preferences;
    const allowed = ['email_security', 'email_product', 'in_app'];
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some((key) => !allowed.includes(key)) ||
        Object.values(value).some((item) => typeof item !== 'boolean')) {
      errors.push('notification_preferences không hợp lệ.');
    }
  }
  return errors;
}

module.exports = { isSafeHttpUrl, validateProfilePatch };
