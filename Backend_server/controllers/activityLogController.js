const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');

// GET /api/activity-logs?limit=50&page=1&action=LOGIN&user_id=xxx&email=xxx&target=xxx&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
const getLogs = async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const page   = Math.max(parseInt(req.query.page)   || 1,  1);
        const skip   = (page - 1) * limit;

        const filter = {};

        if (req.query.action)  filter.action  = req.query.action;
        if (req.query.user_id) filter.user_id = req.query.user_id;
        if (req.query.target)  filter.$or = [
            { target: { $regex: req.query.target, $options: 'i' } },
            { target_id: { $regex: req.query.target, $options: 'i' } }
        ];

        // Date range filter
        if (req.query.fromDate || req.query.toDate) {
            filter.createdAt = {};
            if (req.query.fromDate) {
                const from = new Date(req.query.fromDate);
                if (!isNaN(from)) filter.createdAt.$gte = from;
            }
            if (req.query.toDate) {
                const to = new Date(req.query.toDate);
                if (!isNaN(to)) {
                    to.setHours(23, 59, 59, 999);
                    filter.createdAt.$lte = to;
                }
            }
        }

        // Email search: find user IDs first, then filter logs
        if (req.query.email) {
            const emailRegex = new RegExp(req.query.email, 'i');
            const matchingUsers = await User.find({ email: emailRegex }).select('_id').lean();
            const userIds = matchingUsers.map(u => u._id);
            if (userIds.length === 0) {
                // No such user, return empty result
                return res.status(200).json({ total: 0, page, limit, logs: [] });
            }
            filter.user_id = { $in: userIds };
        }

        const [logs, total] = await Promise.all([
            ActivityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate('user_id', 'email full_name role')
                .lean(),
            ActivityLog.countDocuments(filter)
        ]);

        res.status(200).json({ total, page, limit, logs });
    } catch (error) {
        console.error('[ActivityLog] Error:', error);
        res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
    }
};

module.exports = { getLogs };
