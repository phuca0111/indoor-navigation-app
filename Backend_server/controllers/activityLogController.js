const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');

// GET /api/activity-logs?limit=50&page=1&action=LOGIN&user_id=xxx&email=xxx&target=xxx&fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
const getLogs = async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
        const page   = Math.max(parseInt(req.query.page)   || 1,  1);
        const skip   = (page - 1) * limit;

        const filter = {};
        let orgUserIds = null;

        if (req.user.role === 'ORG_ADMIN') {
            const me = await User.findById(req.user.userId).select('organization_id').lean();
            if (!me?.organization_id) {
                return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
            }
            const orgUsers = await User.find({ organization_id: me.organization_id }).select('_id').lean();
            orgUserIds = orgUsers.map(u => u._id);
            filter.user_id = { $in: orgUserIds };
        }

        if (req.query.action)  filter.action  = req.query.action;
        if (req.query.user_id) {
            const uid = req.query.user_id;
            if (orgUserIds && !orgUserIds.some(id => String(id) === String(uid))) {
                return res.status(200).json({ total: 0, page, limit, logs: [] });
            }
            filter.user_id = uid;
        }
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
            const userQuery = { email: emailRegex };
            if (req.user.role === 'ORG_ADMIN' && orgUserIds) {
                userQuery._id = { $in: orgUserIds };
            }
            const matchingUsers = await User.find(userQuery).select('_id').lean();
            const userIds = matchingUsers.map(u => u._id);
            if (userIds.length === 0) {
                return res.status(200).json({ total: 0, page, limit, logs: [] });
            }
            if (filter.user_id && filter.user_id.$in) {
                const allowed = new Set(userIds.map(String));
                const intersected = filter.user_id.$in.filter(id => allowed.has(String(id)));
                if (!intersected.length) {
                    return res.status(200).json({ total: 0, page, limit, logs: [] });
                }
                filter.user_id = { $in: intersected };
            } else {
                filter.user_id = { $in: userIds };
            }
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
