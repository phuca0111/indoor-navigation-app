// Phase 8 — Floor edit lock HTTP handlers
const {
  acquire,
  heartbeat,
  release,
  status,
  getTtlSec,
  getBackendName
} = require('../application/mapLifecycle/lockApplicationService');

function parseFloor(params) {
  const floorNum = parseInt(params.floor, 10);
  if (!Number.isFinite(floorNum)) {
    return { error: { status: 400, message: 'Số tầng không hợp lệ.' } };
  }
  return { floorNum };
}

// POST /:buildingId/:floor/lock
async function acquireLock(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });
    const sessionId = String(req.body?.session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ message: 'Thiếu session_id.', code: 'LOCK_BAD_REQUEST' });
    }

    const result = await acquire({
      buildingId,
      floorNumber: floorNum,
      actor: req.user,
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
      backend: getBackendName(),
      lock: {
        building_id: result.lock.building_id,
        floor_number: result.lock.floor_number,
        user_id: result.lock.user_id,
        user_email: result.lock.user_email,
        session_id: result.lock.session_id,
        expires_at: result.lock.expires_at,
        fencing_token: result.lock.fencing_token
      }
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: 'Lỗi lock tầng: ' + e.message, code: e.code });
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
      floorNumber: floorNum,
      actor: req.user,
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
    res.status(e.status || 500).json({ message: 'Lỗi heartbeat lock: ' + e.message, code: e.code });
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
      floorNumber: floorNum,
      actor: req.user,
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
    res.status(e.status || 500).json({ message: 'Lỗi release lock: ' + e.message, code: e.code });
  }
}

// GET /:buildingId/:floor/lock
async function getLockStatus(req, res) {
  try {
    const { buildingId } = req.params;
    const { floorNum, error } = parseFloor(req.params);
    if (error) return res.status(error.status).json({ message: error.message });

    const result = await status({ buildingId, floorNumber: floorNum, actor: req.user });
    res.status(200).json({
      held: result.held,
      ttl_sec: getTtlSec(),
      backend: getBackendName(),
      holder: result.holder || null,
      lock: result.held
        ? {
            building_id: result.lock.building_id,
            floor_number: result.lock.floor_number,
            expires_at: result.lock.expires_at,
            session_id: result.lock.session_id,
            user_id: result.lock.user_id,
            user_email: result.lock.user_email,
            fencing_token: result.lock.fencing_token
          }
        : null
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: 'Lỗi lấy trạng thái lock: ' + e.message, code: e.code });
  }
}

module.exports = {
  acquireLock,
  heartbeatLock,
  releaseLock,
  getLockStatus
};
