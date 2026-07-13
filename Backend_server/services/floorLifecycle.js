/**
 * Floor lifecycle — thêm/bớt số tầng an toàn (đuôi).
 * Quy ước: total_floors = N ↔ tầng hợp lệ 0 .. N-1
 * Bớt: chỉ tầng cao nhất; có Floor document → CHẶN (FLOOR_HAS_MAP).
 */
const Floor = require('../models/Floor');

const MAX_FLOORS = Number(process.env.MAX_BUILDING_FLOORS) || 20;

function floorRangeList(n) {
  const count = Math.max(0, Number(n) || 0);
  return Array.from({ length: count }, (_, i) => i);
}

function makeError(status, code, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  Object.assign(err, extra);
  return err;
}

/**
 * Có document Floor cho (building, floor_number) → coi như "có map" (D1).
 */
async function hasFloorDocument(buildingId, floorNumber) {
  const doc = await Floor.findOne({
    building_id: buildingId,
    floor_number: floorNumber
  })
    .select('_id version floor_number')
    .lean();
  return doc;
}

/**
 * Tăng total_floors +1 (chưa tạo Floor stub).
 */
async function addFloor(building) {
  const current = Number(building.total_floors) || 1;
  if (current >= MAX_FLOORS) {
    throw makeError(
      400,
      'FLOOR_MAX',
      `Số tầng tối đa là ${MAX_FLOORS}.`,
      { max: MAX_FLOORS }
    );
  }
  building.total_floors = current + 1;
  await building.save();
  return {
    building,
    from: current,
    to: building.total_floors,
    new_floor_number: current // tầng mới sau khi tăng = old N
  };
}

/**
 * Giảm total_floors -1 nếu tầng đuôi không có Floor document.
 */
async function removeFloor(building) {
  const current = Number(building.total_floors) || 1;
  if (current <= 1) {
    throw makeError(400, 'FLOOR_MIN', 'Tòa nhà phải còn ít nhất 1 tầng.');
  }

  const top = current - 1;
  const floorDoc = await hasFloorDocument(building._id, top);
  if (floorDoc) {
    throw makeError(
      409,
      'FLOOR_HAS_MAP',
      `Không thể giảm: tầng ${top} còn bản đồ (version ${floorDoc.version || '?'}). Mở Editor để xử lý trước.`,
      {
        floor_number: top,
        version: floorDoc.version || null,
        floor_id: String(floorDoc._id)
      }
    );
  }

  building.total_floors = current - 1;
  await building.save();
  return {
    building,
    from: current,
    to: building.total_floors,
    removed_floor_number: top
  };
}

/**
 * Đồng bộ khi PUT building gửi total_floors khác hiện tại.
 * Tăng: cho phép nhảy lên (chỉ metadata). Giảm: từng bậc, chặn nếu đuôi có Floor.
 */
async function applyTotalFloorsChange(building, newTotalRaw) {
  const newTotal = parseInt(newTotalRaw, 10);
  if (!Number.isFinite(newTotal)) {
    throw makeError(400, 'FLOOR_INVALID', 'Số tầng không hợp lệ.');
  }
  if (newTotal < 1) {
    throw makeError(400, 'FLOOR_MIN', 'Tòa nhà phải còn ít nhất 1 tầng.');
  }
  if (newTotal > MAX_FLOORS) {
    throw makeError(
      400,
      'FLOOR_MAX',
      `Số tầng tối đa là ${MAX_FLOORS}.`,
      { max: MAX_FLOORS }
    );
  }

  const current = Number(building.total_floors) || 1;
  if (newTotal === current) {
    return { building, from: current, to: current, changed: false };
  }

  if (newTotal > current) {
    building.total_floors = newTotal;
    await building.save();
    return { building, from: current, to: newTotal, changed: true, direction: 'add' };
  }

  // Giảm từng bậc từ đuôi — chặn ngay khi gặp Floor
  let n = current;
  while (n > newTotal) {
    const top = n - 1;
    const floorDoc = await hasFloorDocument(building._id, top);
    if (floorDoc) {
      throw makeError(
        409,
        'FLOOR_HAS_MAP',
        `Không thể giảm xuống ${newTotal}: tầng ${top} còn bản đồ (version ${floorDoc.version || '?'}).`,
        {
          floor_number: top,
          version: floorDoc.version || null,
          floor_id: String(floorDoc._id),
          requested: newTotal,
          current: n
        }
      );
    }
    n -= 1;
  }

  building.total_floors = newTotal;
  await building.save();
  return { building, from: current, to: newTotal, changed: true, direction: 'remove' };
}

/**
 * floorNum phải thuộc [0 .. total_floors-1].
 */
function assertFloorInRange(floorNum, totalFloors) {
  const n = Number(totalFloors) || 1;
  if (!Number.isFinite(floorNum) || floorNum < 0 || floorNum >= n) {
    throw makeError(
      400,
      'FLOOR_OUT_OF_RANGE',
      `Tầng ${floorNum} ngoài phạm vi hợp lệ (0..${n - 1}).`,
      { floor_number: floorNum, total_floors: n }
    );
  }
}

function clampCreateTotalFloors(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > MAX_FLOORS) {
    throw makeError(
      400,
      'FLOOR_MAX',
      `Số tầng tối đa là ${MAX_FLOORS}.`,
      { max: MAX_FLOORS }
    );
  }
  return n;
}

module.exports = {
  MAX_FLOORS,
  floorRangeList,
  addFloor,
  removeFloor,
  applyTotalFloorsChange,
  assertFloorInRange,
  hasFloorDocument,
  clampCreateTotalFloors
};
