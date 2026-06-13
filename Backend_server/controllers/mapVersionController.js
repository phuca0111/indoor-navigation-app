const MapVersion = require('../models/MapVersion');

// GET /api/map-versions/:buildingId/:floor
const getVersions = async (req, res) => {
    try {
        const { buildingId, floor } = req.params;
        const versions = await MapVersion.find({ building_id: buildingId, floor_number: parseInt(floor) })
            .sort({ version: -1 })
            .populate('published_by', 'email')
            .lean();
        res.status(200).json(versions);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

// GET /api/map-versions/:buildingId/:floor/:version  — lấy snapshot đồ thị cụ thể
const getVersionDetail = async (req, res) => {
    try {
        const { buildingId, floor, version } = req.params;
        const v = await MapVersion.findOne({
            building_id:  buildingId,
            floor_number: parseInt(floor),
            version:      parseInt(version)
        }).lean();
        if (!v) return res.status(404).json({ message: 'Không tìm thấy phiên bản này!' });
        res.status(200).json(v);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { getVersions, getVersionDetail };
