const DomainEvent = require('../models/DomainEvent');
const { replayDeadEvent } = require('../shared/events/eventBus');

async function listDeadEvents(req, res, next) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = { status: 'DEAD' };
    if (req.query.type) filter.type = String(req.query.type);
    const [items, total] = await Promise.all([
      DomainEvent.find(filter)
        .sort({ occurred_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-payload.secret -payload.otp -payload.token -payload.password')
        .lean(),
      DomainEvent.countDocuments(filter)
    ]);
    res.json({ items, total, page, limit });
  } catch (error) {
    next(error);
  }
}

async function replayEvent(req, res, next) {
  try {
    const event = await replayDeadEvent(req.params.eventId, {
      actor_id: req.user.userId,
      reason: req.body?.reason
    });
    if (!event) {
      return res.status(404).json({
        code: 'DEAD_EVENT_NOT_FOUND',
        message: 'Không tìm thấy dead-letter event.'
      });
    }
    return res.json({ event });
  } catch (error) {
    return next(error);
  }
}

module.exports = { listDeadEvents, replayEvent };
