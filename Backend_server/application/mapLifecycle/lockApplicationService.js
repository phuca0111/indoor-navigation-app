const lifecycle = require('../../repositories/mapLifecycleRepository');
const locks = require('../../services/floorEditLock');

function notFound() {
  return Object.assign(new Error('Không tìm thấy tòa nhà!'), { status: 404 });
}

async function acquire(input) {
  const [building, actor] = await Promise.all([
    lifecycle.findBuilding(input.buildingId),
    lifecycle.findActor(input.actor.userId)
  ]);
  if (!building) throw notFound();
  return locks.acquire({
    buildingId: input.buildingId,
    floor: input.floorNumber,
    userId: input.actor.userId,
    email: actor?.email || '',
    sessionId: input.sessionId,
    force: input.force,
    callerRole: input.actor.role
  });
}

async function heartbeat(input) {
  return locks.heartbeat({
    buildingId: input.buildingId,
    floor: input.floorNumber,
    userId: input.actor.userId,
    sessionId: input.sessionId
  });
}

async function release(input) {
  return locks.release({
    buildingId: input.buildingId,
    floor: input.floorNumber,
    userId: input.actor.userId,
    sessionId: input.sessionId,
    force: input.force,
    callerRole: input.actor.role
  });
}

async function status(input) {
  return locks.getStatus(input.buildingId, input.floorNumber);
}

module.exports = {
  acquire,
  heartbeat,
  release,
  status,
  getTtlSec: locks.getTtlSec,
  getBackendName: locks.getBackendName
};
