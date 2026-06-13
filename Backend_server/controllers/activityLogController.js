const ActivityLog = require('../models/ActivityLog');

// GET /api/activity-logs?limit=50&page=1&action=LOGIN&user_id=xxx
const getLogs = async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const page   = Math.max(parseInt(req.query.page)   || 1,  1);
        const skip   = (page - 1) * limit;

        const filter = {};
        if (req.query.action)  filter.action  = req.query.action;
        if (req.query.user_id) filter.user_id = req.query.user_id;

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('user_id', 'email role')
                .lean(),
            ActivityLog.countDocuments(filter)
        ]);

        res.status(200).json({ total, page, limit, logs });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { getLogs };
