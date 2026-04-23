// ============================================
// FILE: qrController.js
// MỤC ĐÍCH: Tra cứu mã QR — Android scan QR → tìm vị trí tức thì
// PUBLIC API: không cần JWT token
// ============================================

const QrCode = require('../models/QrCode');

// GET /api/qr/:qrCode
// Android scan QR → gửi giá trị qr_code lên → nhận về building_id, floor, vị trí, node_id
const getQrInfo = async (req, res) => {
    try {
        const { qrCode } = req.params;

        const qr = await QrCode.findOne({ qr_code: qrCode })
                                .select('-__v')
                                .lean();

        if (!qr) {
            return res.status(404).json({ message: 'Không tìm thấy mã QR này trong hệ thống!' });
        }

        res.status(200).json({
            qr_code:      qr.qr_code,
            building_id:  qr.building_id,
            floor_number: qr.floor_number,
            x:            qr.x,
            y:            qr.y,
            node_id:      qr.node_id,
            label:        qr.label
        });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi tra cứu mã QR: ' + error.message });
    }
};

module.exports = { getQrInfo };
