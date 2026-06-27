// ============================================
// FILE: organizationController.js
// MỤC ĐÍCH: Xử lý logic liên quan đến Organization
// ============================================

const Organization = require('../models/Organization');

// WHY: Chỉ Super Admin được list organizations.
async function listOrganizations(req, res) {
  try {
    // Kiểm tra quyền Super Admin (req.user từ authenticateToken middleware)
    if (!req.user || req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Chỉ Super Admin được truy cập.' });
    }

    const { active } = req.query;
    const query = active === 'true' ? { is_active: true } : {};

    // Chỉ lấy field cần thiết, sắp xếp theo tên
    const orgs = await Organization.find(query)
      .select('name slug is_active plan created_at')
      .sort({ name: 1 });

    res.status(200).json(orgs);
  } catch (error) {
    console.error('ListOrganizations error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

module.exports = {
  listOrganizations
};
