const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const {
  resolveStreamActions,
  streamsForRole
} = require('../utils/activityLogStreams');

// GET /api/activity-logs?limit=50&page=1&stream=buildings&action=LOGIN&...
const getLogs = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const role = req.user.role;

    const streamId = String(req.query.stream || 'all').trim().toLowerCase() || 'all';
    const streamResolved = resolveStreamActions(streamId, role);
    if (!streamResolved.ok) {
      return res.status(streamResolved.status).json({
        message: streamResolved.message,
        code: streamResolved.code
      });
    }

    const filter = {};
    let orgUserIds = null;

    if (role === 'ORG_ADMIN') {
      const me = await User.findById(req.user.userId).select('organization_id').lean();
      if (!me?.organization_id) {
        return res.status(403).json({ message: 'Tài khoản ORG_ADMIN chưa được gán tổ chức.' });
      }
      const orgUsers = await User.find({ organization_id: me.organization_id }).select('_id').lean();
      orgUserIds = orgUsers.map((u) => u._id);
      filter.user_id = { $in: orgUserIds };
    }

    const requestedAction = String(req.query.action || '').trim();
    if (requestedAction) {
      if (!streamResolved.actions.includes(requestedAction)) {
        return res.status(200).json({
          total: 0,
          page,
          limit,
          stream: streamResolved.stream,
          logs: []
        });
      }
      filter.action = requestedAction;
    } else if (streamResolved.actions.length) {
      filter.action = { $in: streamResolved.actions };
    } else {
      return res.status(200).json({
        total: 0,
        page,
        limit,
        stream: streamResolved.stream,
        logs: []
      });
    }

    if (req.query.user_id) {
      const uid = req.query.user_id;
      if (orgUserIds && !orgUserIds.some((id) => String(id) === String(uid))) {
        return res.status(200).json({
          total: 0,
          page,
          limit,
          stream: streamResolved.stream,
          logs: []
        });
      }
      filter.user_id = uid;
    }
    if (req.query.target) {
      filter.$or = [
        { target: { $regex: req.query.target, $options: 'i' } },
        { target_id: { $regex: req.query.target, $options: 'i' } }
      ];
    }

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

    if (req.query.email) {
      const emailRegex = new RegExp(req.query.email, 'i');
      const userQuery = { email: emailRegex };
      if (role === 'ORG_ADMIN' && orgUserIds) {
        userQuery._id = { $in: orgUserIds };
      }
      const matchingUsers = await User.find(userQuery).select('_id').lean();
      const userIds = matchingUsers.map((u) => u._id);
      if (userIds.length === 0) {
        return res.status(200).json({
          total: 0,
          page,
          limit,
          stream: streamResolved.stream,
          logs: []
        });
      }
      if (filter.user_id && filter.user_id.$in) {
        const allowed = new Set(userIds.map(String));
        const intersected = filter.user_id.$in.filter((id) => allowed.has(String(id)));
        if (!intersected.length) {
          return res.status(200).json({
            total: 0,
            page,
            limit,
            stream: streamResolved.stream,
            logs: []
          });
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

    res.status(200).json({
      total,
      page,
      limit,
      stream: streamResolved.stream,
      streams: streamsForRole(role),
      logs
    });
  } catch (error) {
    console.error('[ActivityLog] Error:', error);
    res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
};

module.exports = { getLogs };
