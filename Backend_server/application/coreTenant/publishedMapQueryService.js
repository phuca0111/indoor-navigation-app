const publishedMaps = require('../../repositories/publishedMapReadRepository');
const coreTenant = require('../../repositories/coreTenantRepository');
const activityLogs = require('../../repositories/activityLogRepository');
const publicMapCache = require('../../services/publicMapCache');
const { assertOrgCapability } = require('../../utils/orgBillingGates');

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

async function assertPublicAccess(buildingId) {
  const building = await publishedMaps.findBuildingForPublishedMap(buildingId);
  if (!building) {
    throw httpError(404, 'Không tìm thấy bản đồ hoặc tòa nhà chưa được xuất bản.');
  }
  if (building.organization_id) {
    const organization = await publishedMaps.findOrganizationProjection(
      building.organization_id
    );
    if (organization) {
      const gate = assertOrgCapability(organization, 'canNavigation');
      if (!gate.ok) {
        throw httpError(
          403,
          gate.message || 'Điều hướng tạm khóa do gói tổ chức hết hạn.',
          gate.code || 'BILLING_EXPIRED'
        );
      }
    }
  }
  return building;
}

async function loadMap(input) {
  const floorNumber = Number.parseInt(input.floor, 10);
  if (!Number.isFinite(floorNumber)) {
    throw httpError(404, 'Chưa có bản đồ cho tầng này!');
  }

  let actor = input.actor;
  let building;
  if (actor) {
    const persistedActor = await coreTenant.findUserScope(actor.userId);
    actor = {
      ...actor,
      organization_id: persistedActor?.organization_id || actor.organization_id,
      assigned_buildings: persistedActor?.assigned_buildings || []
    };
    building = await publishedMaps.findBuildingForActor(input.buildingId, actor);
    if (!building) throw httpError(403, 'Bạn không có quyền truy cập tòa nhà này.');
  } else {
    building = await assertPublicAccess(input.buildingId);
  }
  const totalFloors = Number(building.total_floors) || 1;
  if (floorNumber < 0 || floorNumber >= totalFloors) {
    throw httpError(
      404,
      `Tầng ${floorNumber} ngoài phạm vi (0..${totalFloors - 1}).`,
      'FLOOR_OUT_OF_RANGE'
    );
  }

  if (!input.actor) {
    const cached = await publicMapCache.get(input.buildingId, floorNumber);
    if (cached) {
      const current = await publishedMaps.findFloorForActor(
        input.buildingId,
        floorNumber,
        null
      );
      if (current && Number(current.version) === Number(cached.version)) {
        return { status: 200, body: cached, headers: { 'X-Map-Cache': 'HIT' } };
      }
    }
  }

  const map = await publishedMaps.findFloorForActor(
    input.buildingId,
    floorNumber,
    actor
  );
  if (!map) throw httpError(404, 'Chưa có bản đồ cho tầng này!');

  if (input.actor?.userId) {
    await activityLogs.recordActivity({
      user_id: input.actor.userId,
      action: 'LOAD_MAP',
      target_type: 'floor',
      target_id: String(map._id),
      target: `Building ${input.buildingId} - Tầng ${input.floor}`,
      details: { version: map.version, message: 'Tải bản đồ lên Editor' },
      ip_address: input.ip || ''
    }).catch(() => {});
    return { status: 200, body: map };
  }

  await publicMapCache.set(input.buildingId, floorNumber, map);
  return { status: 200, body: map, headers: { 'X-Map-Cache': 'MISS' } };
}

async function downloadMap(input) {
  await assertPublicAccess(input.buildingId);
  const result = await publishedMaps.listPublishedFloors(input.buildingId);
  if (!result?.floors?.length) {
    throw httpError(404, 'Tòa nhà này chưa có bản đồ!');
  }
  return {
    status: 200,
    body: {
      building_id: input.buildingId,
      total_floors: result.building.total_floors ?? result.floors.length,
      floors_count: result.floors.length,
      floors: result.floors
    }
  };
}

module.exports = { loadMap, downloadMap };
