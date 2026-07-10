// Chính sách mật khẩu — dùng cho đăng ký công khai, đổi mật khẩu, ORG_ADMIN tạo user

function validatePasswordStrength(password) {
  const errors = [];
  const pwd = typeof password === 'string' ? password : '';

  if (!pwd || pwd.length < 8) {
    errors.push('Mật khẩu phải có ít nhất 8 ký tự.');
    return errors;
  }
  if (!/(?=.*[a-z])/.test(pwd)) {
    errors.push('Mật khẩu phải chứa ít nhất 1 chữ thường.');
  }
  if (!/(?=.*[A-Z])/.test(pwd)) {
    errors.push('Mật khẩu phải chứa ít nhất 1 chữ hoa.');
  }
  if (!/(?=.*\d)/.test(pwd)) {
    errors.push('Mật khẩu phải chứa ít nhất 1 số.');
  }
  if (!/(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/.test(pwd)) {
    errors.push('Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt.');
  }
  return errors;
}

function validatePasswordMinLength(password, min = 8) {
  const pwd = typeof password === 'string' ? password : '';
  if (!pwd || pwd.length < min) {
    return [`Mật khẩu phải có ít nhất ${min} ký tự.`];
  }
  return [];
}

module.exports = {
  validatePasswordStrength,
  validatePasswordMinLength
};
