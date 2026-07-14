// Phase 8 — Floor edit lock HTTP handlers
const User = require('../models/User');
const Building = require('../models/Building');
const {
  acquire,
  heartbeat,
  release,
  getStatus,
  getTtlSec
} = require('../services/floorEditLock');

function parseFloor(params) {
  const floorNum = parseInt(params.floor, 10);
  if (!Number.isFinite(floorNum)) {
    return { error: { status: 400, message: 'Số tầng không hợp lệ.' } };
  }
  return { floorNum };
}

async function assertBuildingExists(buildingId, res) {
  const b = await Building.findById(buildingId).select('_id').lean();
  if (!b) {
    res.status(404).json({ message: 'Không tìm thấy tòa nhà!' });
    return false;
  }
  return true;
}

// POST /:buildingId/:floor/lock
async function acquireLock(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });
    if (!(await assertBuildingExists(buildingId, res))) return;

    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Thiếu session_id.', code: 'LOCK_BAD_REQUEST' });
    }

    const me = await User.findById(req.user.userId).select('email').lean();
    const result = await acquire({
      buildingId,
      floor: floorNum,
      userId: req.user.userId,
      email: me?.email || '',
      sessionId,
      force: !!req.body?.force,
      callerRole: req.user.role
    });

    if (!result.ok) {
      return res.status(409).json({
        message: result.message,
        code: result.code,
        holder: result.holder
      });
    }

    res.status(200).json({
      message: result.renewed ? 'Gia hạn lock thành công.' : 'Giữ lock tầng thành công.',
      ttl_sec: getTtlSec(),
      lock: {
        building_id: result.lock.building_id,
        floor_number: result.lock.floor_number,
        user_id: result.lock.user_id,
        user_email: result.lock.user_email,
        session_id: result.lock.session_id,
        expires_at: result.lock.expires_at
      }
    });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi lock tầng: ' + e.message });
  }
}

// POST /:buildingId/:floor/lock/heartbeat
async function heartbeatLock(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Thiếu session_id.', code: 'LOCK_BAD_REQUEST' });
    }

    const result = await heartbeat({
      buildingId,
      floor: floorNum,
      userId: req.user.userId,
      sessionId
    });

    if (!result.ok) {
      return res.status(409).json({
        message: result.message,
        code: result.code,
        holder: result.holder
      });
    }

    res.status(200).json({
      message: 'Heartbeat OK.',
      ttl_sec: getTtlSec(),
      expires_at: result.lock.expires_at
    });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi heartbeat lock: ' + e.message });
  }
}

// POST /:buildingId/:floor/lock/release
async function releaseLock(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const sessionId = String(req.body?.session_id || '').trim();
    const result = await release({
      buildingId,
      floor: floorNum,
      userId: req.user.userId,
      sessionId,
      force: !!req.body?.force,
      callerRole: req.user.role
    });

    if (!result.ok) {
      return res.status(409).json({
        message: result.message,
        code: result.code,
        holder: result.holder
      });
    }

    res.status(200).json({
      message: result.released ? 'Đã nhả lock.' : 'Không có lock để nhả.',
      released: !!result.released
    });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi release lock: ' + e.message });
  }
}

// GET /:buildingId/:floor/lock
async function getLockStatus(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const status = await getStatus(buildingId, floorNum);
    res.status(200).json({
      held: status.held,
      ttl_sec: getTtlSec(),
      holder: status.holder || null,
      lock: status.held
        ? {
            building_id: status.lock.building_id,
            floor_number: status.lock.floor_number,
            expires_at: status.lock.expires_at,
            session_id: status.lock.session_id,
            user_id: status.lock.user_id,
            user_email: status.lock.user_email
          }
        : null
    });
  } catch (e) {
    res.status(500).json({ message: 'Lỗi lấy trạng thái lock: ' + e.message });
  }
}

module.exports = {
  acquireLock,
  heartbeatLock,
  releaseLock,
  getLockStatus
};
