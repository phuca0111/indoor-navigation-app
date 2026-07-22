/**
 * Lưu / đọc hồ sơ thanh toán trên User (tự điền form checkout).
 */
const User = require('../models/User');

function normalizeBillingContact(contact = {}) {
  return {
    full_name: String(contact.full_name || '').trim(),
    company: String(contact.company || '').trim(),
    address: String(contact.address || '').trim(),
    city: String(contact.city || '').trim(),
    country: String(contact.country || '').trim() || 'Việt Nam',
    phone: String(contact.phone || '').trim().replace(/[^\d]/g, '')
  };
}

/**
 * @returns {Promise<object|null>} billing_profile đã lưu
 */
async function saveUserBillingProfile(userId, contact) {
  if (!userId || !contact || typeof contact !== 'object') return null;
  const next = normalizeBillingContact(contact);
  // Chỉ lưu khi có đủ lõi (tránh ghi đè bằng object rỗng)
  if (!next.full_name || !next.address || !next.city || !next.phone) return null;

  const update = {
    billing_profile: {
      ...next,
      updated_at: new Date()
    }
  };
  // Đồng bộ phone + full_name chính nếu đang trống / để đồng bộ UI
  if (next.phone) update.phone = next.phone;
  if (next.full_name) update.full_name = next.full_name;

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
    .select('billing_profile phone full_name')
    .lean();
  return user?.billing_profile || null;
}

module.exports = {
  normalizeBillingContact,
  saveUserBillingProfile
};
