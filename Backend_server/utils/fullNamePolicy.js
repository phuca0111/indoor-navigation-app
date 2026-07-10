// Chính sách họ tên — chữ cái (kể cả tiếng Việt), không cho số

const ALLOWED_FULL_NAME_RE = /^[\p{L}\s'.-]+$/u;

function validateFullName(name) {
  const errors = [];
  const value = typeof name === 'string' ? name.trim() : '';

  if (!value) {
    errors.push('Họ tên là bắt buộc.');
    return errors;
  }
  if (value.length < 2) {
    errors.push('Họ tên phải có ít nhất 2 ký tự.');
  }
  if (!ALLOWED_FULL_NAME_RE.test(value)) {
    errors.push('Họ tên chỉ được chứa chữ cái, khoảng trắng, dấu gạch ngang hoặc dấu nháy (không dùng số).');
  }
  const letters = value.match(/\p{L}/gu);
  if (!letters || letters.length < 2) {
    errors.push('Họ tên phải có ít nhất 2 chữ cái.');
  }
  return errors;
}

function normalizeFullName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

module.exports = {
  validateFullName,
  normalizeFullName
};
