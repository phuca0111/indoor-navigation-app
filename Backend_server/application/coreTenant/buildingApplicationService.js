const repository = require('../../repositories/coreTenantRepository');
const activities = require('../../repositories/activityLogRepository');
const eventBus = require('../../shared/events/eventBus');
const {
  assertCanCreateBuilding,
  assertCanCreateBuildingForUser,
  assertCanAddFloorForUser
} = require('../../utils/planQuota');
const { assertBuildingWritable } = require('../../utils/overQuotaLock');
const {
  normalizeVisibility,
  MAP_VISIBILITY_VALUES,
  MAP_VISIBILITY,
  assertVisibilityAllowedForStatus,
  visibilityAfterStatusChange
} = require('../../utils/mapVisibility');
const { resolvePlaceIdForNewBuilding } = require('../../services/placeEnsure');
const {
  MAX_FLOORS,
  floorRangeList,
  clampCreateTotalFloors,
  floorHasMapContent,
  assertFloorInRange,
  validateFloorReorder
} = require('../../services/floorLifecycle');
const { haversineMeters } = require('../../services/placeDuplicateDetection');
const { autosaveFingerprint } = require('../../domain/mapLifecyclePolicies');
const policy = require('./coreTenantPolicy');
const { runCoreTenantCommand } = require('./runCoreTenantCommand');

const MAP_CONTENT_KEYS = ['rooms', 'pois', 'nodes', 'edges', 'walls', 'qr_anchors'];
const BUILDING_DUPLICATE_METERS = 30;

function cloneMapPayload(src) {
  try {
    return JSON.parse(JSON.stringify(src && typeof src === 'object' ? src : {}));
  } catch (e) {
    return {};
  }
}

function mapPayloadHasContent(md) {
  const s = md && typeof md === 'object' ? md : {};
  return MAP_CONTENT_KEYS.some((k) => Array.isArray(s[k]) && s[k].length > 0);
}

function fail(status, message, code, details) {
  throw Object.assign(new Error(message), { status, code, details });
}

async function findNearbyBuildingDuplicate({ lat, lng, excludeId = null }) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  const valid =
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    Math.abs(nLat) <= 90 &&
    Math.abs(nLng) <= 180 &&
    !(nLat === 0 && nLng === 0);
  if (!valid) return null;

  const candidates = await repository.listNearbyBuildingsForDuplicateCheck({
    lat: nLat,
    lng: nLng,
    excludeId
  });

  let nearest = null;
  for (const b of candidates) {
    const bLat = Number(b?.gps_location?.lat);
    const bLng = Number(b?.gps_location?.lng);
    if (!Number.isFinite(bLat) || !Number.isFinite(bLng)) continue;
    const meters = haversineMeters(nLat, nLng, bLat, bLng);
    if (!Number.isFinite(meters)) continue;
    if (!nearest || meters < nearest.distance_meters) {
      nearest = {
        building_id: b._id,
        building_name: b.name || '',
        distance_meters: Math.round(meters),
        organization_id: b.organization_id || null,
        owner_user_id: b.owner_user_id || null
      };
    }
  }
  if (nearest && nearest.distance_meters <= BUILDING_DUPLICATE_METERS) {
    return nearest;
  }
  return null;
}

async function recordMutation({ action, building, actor, ip, details, session }) {
  await activities.recordActivity({
    user_id: actor?.userId || null,
    action,
    target_type: 'building',
    target_id: String(building._id),
    target: building.name,
    details,
    ip_address: ip || '',
    organization_id: building.organization_id || null
  }, { session });
  await eventBus.publish({
    type: action === 'DEACTIVATE_BUILDING'
      ? 'BuildingDeactivated'
      : action === 'ACTIVATE_BUILDING'
        ? 'BuildingRestored'
        : action === 'CREATE_BUILDING'
          ? 'BuildingCreated'
          : 'BuildingUpdated',
    event_key: `core-tenant:${action}:${building._id}:${Date.now()}`,
    aggregate_type: 'Building',
    aggregate_id: building._id,
    organization_id: building.organization_id || null,
    actor_user_id: actor?.userId || null,
    payload: details || {}
  }, { session });
}

async function createBuilding(input, options = {}) {
  const scope = policy.buildingCreateScope(input.actor, input.body.organization_id);
  const totalFloors = clampCreateTotalFloors(input.body.total_floors || 1);
  let organization = null;

  if (scope.kind === 'ORGANIZATION') {
    organization = await repository.findOrganizationById(
      scope.organizationId,
      { kind: 'SYSTEM' }
    );
    if (!organization) fail(400, 'Organization không tồn tại.');
    if (organization.is_active === false) fail(400, 'Organization đã bị vô hiệu hóa.');
    const quota = await assertCanCreateBuilding(organization);
    if (!quota.ok) fail(403, quota.message, quota.code, { usage: quota.usage });
  } else {
    const actor = await repository.findUserScope(input.actor.userId);
    const quota = await assertCanCreateBuildingForUser({
      _id: input.actor.userId,
      plan: actor?.plan
    });
    if (!quota.ok) fail(403, quota.message, quota.code, { usage: quota.usage });
    if (
      quota.limits?.maxFloorsPerBuilding != null &&
      totalFloors > quota.limits.maxFloorsPerBuilding
    ) {
      fail(403, quota.message, quota.code, { usage: quota.usage });
    }
  }

  const lat = input.body.lat ?? input.body.latitude ?? 0;
  const lng = input.body.lng ?? input.body.longitude ?? 0;
  const force = input.body?.force === true || input.body?.force === '1';
  let initialVisibility = MAP_VISIBILITY.PRIVATE;
  if (input.body.visibility !== undefined) {
    initialVisibility = normalizeVisibility(input.body.visibility, '');
    if (!MAP_VISIBILITY_VALUES.includes(initialVisibility)) {
      fail(
        400,
        'visibility phải là PRIVATE | UNLISTED | COMMUNITY | OFFICIAL',
        'INVALID_VISIBILITY'
      );
    }
    // Building mới mặc định DRAFT → không cho COMMUNITY/OFFICIAL ngay
    const matrix = assertVisibilityAllowedForStatus('DRAFT', initialVisibility);
    if (!matrix.ok) fail(400, matrix.message, matrix.code);
  }

  const duplicate = await findNearbyBuildingDuplicate({ lat, lng });
  if (duplicate && !force) {
    fail(
      409,
      `Tọa độ trùng/qua gần tòa nhà "${duplicate.building_name}" (~${duplicate.distance_meters}m). Vui lòng chọn tọa độ khác.`,
      'BUILDING_LOCATION_DUPLICATE',
      { duplicate }
    );
  }

  const building = await runCoreTenantCommand(async (session) => {
    const placeResolved = await resolvePlaceIdForNewBuilding({
      placeId: input.body.place_id || null,
      skipAutoPlace: input.body.skip_auto_place === true || input.body.skip_auto_place === '1',
      actorRole: input.actor?.role,
      name: input.body.name,
      address: input.body.address || '',
      lat,
      lng,
      organizationId: scope.organizationId || null,
      actorUserId: input.actor?.userId || null,
      session
    });

    const created = await repository.createBuilding({
      name: input.body.name,
      address: input.body.address || '',
      gps_location: { lat, lng },
      activation_radius: input.body.activation_radius || 50,
      description: input.body.description || '',
      total_floors: totalFloors,
      created_by: input.actor?.userId || null,
      organization_id: scope.organizationId || null,
      owner_user_id: scope.userId || null,
      place_id: placeResolved.place_id,
      visibility: initialVisibility
    }, scope, { session });
    await recordMutation({
      action: 'CREATE_BUILDING',
      building: created,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: scope.kind === 'PERSONAL'
          ? 'Tạo tòa nhà (Personal Workspace)'
          : 'Tạo tòa nhà mới',
        organization_id: created.organization_id || null,
        place_id: placeResolved.place_id || null,
        place_auto_created: placeResolved.auto_created,
        force_create: !!force
      },
      session
    });
    return { ...created, _place_auto_created: placeResolved.auto_created };
  }, options);

  const auto = building._place_auto_created;
  const { _place_auto_created, ...buildingOut } = building;
  return {
    status: 201,
    body: {
      message: 'Tạo tòa nhà thành công!',
      building: buildingOut,
      place_auto_created: !!auto
    }
  };
}

async function resolveBuildingScope(actor, buildingId) {
  if (actor?.role === 'SUPER_ADMIN') return { kind: 'SYSTEM' };
  if (actor?.role === 'REGISTERED_USER') {
    return { kind: 'PERSONAL', userId: actor.userId };
  }
  const persisted = await repository.findUserScope(actor?.userId);
  return policy.organizationScope(
    { ...actor, organization_id: persisted?.organization_id },
    persisted?.organization_id
  );
}

async function assertWritable(building, actor) {
  if (actor?.role === 'SUPER_ADMIN' || !building.organization_id) return;
  const organization = await repository.findOrganizationById(
    building.organization_id,
    { kind: 'SYSTEM' }
  );
  if (organization) {
    const writable = await assertBuildingWritable(building._id, organization);
    if (!writable.ok) fail(403, writable.message, writable.code);
  }
}

async function updateBuilding(input, options = {}) {
  if (input.actor?.role === 'BUILDING_ADMIN') {
    fail(403, 'Building Admin không được sửa thông tin tòa nhà. Chỉ được vẽ và xuất bản bản đồ.');
  }
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  await assertWritable(current, input.actor);

  const allowed = [
    'name', 'address', 'description', 'activation_radius'
  ];
  const changes = {};
  allowed.forEach((field) => {
    if (input.body[field] !== undefined) changes[field] = input.body[field];
  });
  // Xử lý status trước, rồi visibility (ma trận publish × community)
  if (input.body.status !== undefined) {
    const nextStatus = String(input.body.status || '').trim().toUpperCase();
    if (nextStatus !== 'DRAFT' && nextStatus !== 'PUBLISHED') {
      fail(400, 'status phải là DRAFT | PUBLISHED', 'INVALID_STATUS');
    }
    changes.status = nextStatus;
    if (input.body.visibility === undefined) {
      const visAdj = visibilityAfterStatusChange(nextStatus, current.visibility);
      if (visAdj.downgraded) changes.visibility = visAdj.visibility;
    }
  }
  if (input.body.visibility !== undefined) {
    const visibility = normalizeVisibility(input.body.visibility, '');
    if (!MAP_VISIBILITY_VALUES.includes(visibility)) {
      fail(
        400,
        'visibility phải là PRIVATE | UNLISTED | COMMUNITY | OFFICIAL',
        'INVALID_VISIBILITY'
      );
    }
    const effectiveStatus = changes.status || current.status || 'DRAFT';
    const matrix = assertVisibilityAllowedForStatus(effectiveStatus, visibility);
    if (!matrix.ok) fail(400, matrix.message, matrix.code);
    changes.visibility = visibility;
  }
  if (input.body.place_id !== undefined && input.actor.role === 'SUPER_ADMIN') {
    if (!input.body.place_id) {
      changes.place_id = null;
    } else {
      const place = await repository.findPlaceForAttachment(input.body.place_id);
      if (!place) fail(400, 'Place không tồn tại.', 'PLACE_NOT_FOUND');
      if (place.status === 'LOCKED' || place.status === 'MERGED') {
        fail(400, 'Place đang khóa/merge.', 'PLACE_NOT_ATTACHABLE');
      }
      changes.place_id = input.body.place_id;
    }
  }
  if (input.body.lat !== undefined || input.body.lng !== undefined) {
    const nextLat = input.body.lat ?? current.gps_location?.lat;
    const nextLng = input.body.lng ?? current.gps_location?.lng;
    const forceLocationUpdate = input.body?.force === true || input.body?.force === '1';
    const duplicate = await findNearbyBuildingDuplicate({
      lat: nextLat,
      lng: nextLng,
      excludeId: current._id
    });
    if (duplicate && !forceLocationUpdate) {
      fail(
        409,
        `Tọa độ mới trùng/qua gần tòa nhà "${duplicate.building_name}" (~${duplicate.distance_meters}m). Vui lòng chọn tọa độ khác.`,
        'BUILDING_LOCATION_DUPLICATE',
        { duplicate }
      );
    }
    changes.gps_location = {
      lat: nextLat,
      lng: nextLng
    };
  }
  if (input.body.total_floors !== undefined) {
    const requested = Number.parseInt(input.body.total_floors, 10);
    if (!Number.isFinite(requested)) fail(400, 'Số tầng không hợp lệ.', 'FLOOR_INVALID');
    if (requested < 1) fail(400, 'Tòa nhà phải còn ít nhất 1 tầng.', 'FLOOR_MIN');
    if (requested > MAX_FLOORS) {
      fail(400, `Số tầng tối đa là ${MAX_FLOORS}.`, 'FLOOR_MAX', { max: MAX_FLOORS });
    }
    for (let floor = Number(current.total_floors) - 1; floor >= requested; floor -= 1) {
      const existing = await repository.findFloorAt(current._id, floor, scope);
      if (floorHasMapContent(existing)) {
        fail(
          409,
          `Không thể giảm xuống ${requested}: tầng ${floor} còn bản đồ (version ${existing.version || '?'}).`,
          'FLOOR_HAS_MAP',
          { floor_number: floor, version: existing.version || null }
        );
      }
    }
    changes.total_floors = requested;
  }

  const building = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateBuilding(current._id, changes, scope, { session });
    await recordMutation({
      action: 'UPDATE_BUILDING',
      building: updated,
      actor: input.actor,
      ip: input.ip,
      details: { message: 'Cập nhật thông tin tòa nhà', changes },
      session
    });
    return updated;
  }, options);
  return {
    status: 200,
    body: { message: 'Cập nhật tòa nhà thành công!', building }
  };
}

async function patchFloors(input, options = {}) {
  if (input.actor?.role === 'BUILDING_ADMIN') {
    fail(403, 'Building Admin không được sửa số tầng. Chỉ SUPER_ADMIN / ORG_ADMIN.');
  }
  const action = String(input.body.action || '').toLowerCase();
  if (!['add', 'remove'].includes(action)) {
    fail(400, 'action phải là "add" hoặc "remove".', 'FLOOR_ACTION_INVALID');
  }
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  await assertWritable(current, input.actor);
  const from = Number(current.total_floors) || 1;
  if (action === 'add' && from >= MAX_FLOORS) {
    fail(400, `Số tầng tối đa là ${MAX_FLOORS}.`, 'FLOOR_MAX', { max: MAX_FLOORS });
  }
  if (action === 'remove' && from <= 1) {
    fail(400, 'Tòa nhà phải còn ít nhất 1 tầng.', 'FLOOR_MIN');
  }
  if (action === 'remove') {
    const floor = await repository.findFloorAt(current._id, from - 1, scope);
    if (floorHasMapContent(floor)) {
      fail(409, `Không thể giảm: tầng ${from - 1} còn bản đồ (version ${floor.version || '?'}).`,
        'FLOOR_HAS_MAP', { floor_number: from - 1, version: floor.version || null });
    }
  }
  if (action === 'add' && current.owner_user_id && !current.organization_id) {
    const owner = await repository.findUserScope(current.owner_user_id);
    const quota = assertCanAddFloorForUser({ plan: owner?.plan }, current);
    if (!quota.ok) fail(403, quota.message, quota.code, { usage: quota.usage });
  }
  const to = action === 'add' ? from + 1 : from - 1;
  const building = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateBuilding(
      current._id,
      { total_floors: to },
      scope,
      { session }
    );
    await recordMutation({
      action: action === 'add' ? 'ADD_FLOOR' : 'REMOVE_FLOOR',
      building: updated,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: action === 'add' ? 'Thêm tầng (đuôi)' : 'Bớt tầng cao nhất',
        changes: { total_floors: { from, to } },
        ...(action === 'add'
          ? { new_floor_number: from }
          : { removed_floor_number: from - 1 })
      },
      session
    });
    return updated;
  }, options);
  return {
    status: 200,
    body: {
      message: action === 'add'
        ? `Đã thêm tầng. Số tầng hiện tại: ${to}.`
        : `Đã bớt tầng cao nhất. Số tầng hiện tại: ${to}.`,
      building,
      total_floors: to,
      floors: floorRangeList(to)
    }
  };
}

/**
 * F2 — Đổi tên tầng (floor_name). Cho phép BUILDING_ADMIN có quyền building.
 * Body: { floor_name: string }
 * Upsert Floor stub version=0 nếu tầng chưa có document (không tính là có map).
 */
async function renameFloor(input, options = {}) {
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  await assertWritable(current, input.actor);

  const floorNumber = Number.parseInt(input.params.floorNumber, 10);
  if (!Number.isFinite(floorNumber)) {
    fail(400, 'floorNumber không hợp lệ.', 'FLOOR_INVALID');
  }
  try {
    assertFloorInRange(floorNumber, current.total_floors);
  } catch (e) {
    fail(e.status || 400, e.message, e.code || 'FLOOR_OUT_OF_RANGE', {
      floor_number: e.floor_number,
      total_floors: e.total_floors
    });
  }

  const floorName = String(input.body?.floor_name ?? '').trim();
  if (!floorName) fail(400, 'Tên tầng không được để trống.', 'FLOOR_NAME_REQUIRED');
  if (floorName.length > 80) fail(400, 'Tên tầng tối đa 80 ký tự.', 'FLOOR_NAME_TOO_LONG');

  const floor = await runCoreTenantCommand(async (session) => {
    const updated = await repository.upsertFloorName(
      current._id,
      floorNumber,
      floorName,
      input.actor?.userId,
      { session }
    );
    await recordMutation({
      action: 'RENAME_FLOOR',
      building: current,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: 'Đổi tên tầng',
        floor_number: floorNumber,
        floor_name: floorName
      },
      session
    });
    return updated;
  }, options);

  return {
    status: 200,
    body: {
      message: 'Đã đổi tên tầng.',
      floor: {
        floor_number: floor.floor_number,
        floor_name: floor.floor_name,
        version: floor.version || 0,
        has_map: floorHasMapContent(floor)
      }
    }
  };
}

/**
 * F6 — Nhân bản tầng: thêm tầng đuôi + copy map (published ưu tiên, fallback draft) vào Draft mới.
 * Body: { source_floor_number } (hoặc params.floorNumber). Kết quả là 1 bản nháp — chưa xuất bản.
 */
async function duplicateFloor(input, options = {}) {
  if (input.actor?.role === 'BUILDING_ADMIN') {
    fail(403, 'Building Admin không được thêm tầng. Chỉ SUPER_ADMIN / ORG_ADMIN.');
  }
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  await assertWritable(current, input.actor);

  const sourceFloor = Number.parseInt(
    input.body?.source_floor_number ?? input.params.floorNumber,
    10
  );
  if (!Number.isFinite(sourceFloor)) {
    fail(400, 'source_floor_number không hợp lệ.', 'FLOOR_INVALID');
  }
  try {
    assertFloorInRange(sourceFloor, current.total_floors);
  } catch (e) {
    fail(e.status || 400, e.message, e.code || 'FLOOR_OUT_OF_RANGE', {
      floor_number: e.floor_number,
      total_floors: e.total_floors
    });
  }

  const from = Number(current.total_floors) || 1;
  if (from >= MAX_FLOORS) {
    fail(400, `Số tầng tối đa là ${MAX_FLOORS}.`, 'FLOOR_MAX', { max: MAX_FLOORS });
  }

  // Nguồn nội dung: ưu tiên bản đã publish, fallback bản nháp.
  const publishedFloor = await repository.findFloorMapData(current._id, sourceFloor);
  let payload = null;
  let sourceName = publishedFloor?.floor_name || '';
  if (publishedFloor?.map_data && mapPayloadHasContent(publishedFloor.map_data)) {
    payload = cloneMapPayload(publishedFloor.map_data);
  } else {
    const sourceDraft = await repository.findActiveDraft(current._id, sourceFloor);
    if (sourceDraft?.payload && mapPayloadHasContent(sourceDraft.payload)) {
      payload = cloneMapPayload(sourceDraft.payload);
    }
  }
  if (!payload) {
    fail(409, `Tầng ${sourceFloor} chưa có bản đồ để nhân bản.`, 'FLOOR_EMPTY', {
      floor_number: sourceFloor
    });
  }

  // Tầng đích chưa có draft (tầng đuôi mới) — nhưng phòng trường hợp lệch dữ liệu.
  const newFloorNumber = from;
  const existingDraft = await repository.findActiveDraft(current._id, newFloorNumber);
  if (existingDraft) {
    fail(409, `Tầng đích ${newFloorNumber} đã có bản nháp.`, 'FLOOR_DRAFT_EXISTS', {
      floor_number: newFloorNumber
    });
  }

  if (current.owner_user_id && !current.organization_id) {
    const owner = await repository.findUserScope(current.owner_user_id);
    const quota = assertCanAddFloorForUser({ plan: owner?.plan }, current);
    if (!quota.ok) fail(403, quota.message, quota.code, { usage: quota.usage });
  }

  const to = from + 1;
  const baseName = sourceName || (sourceFloor === 0 ? 'Tầng trệt' : `Tầng ${sourceFloor}`);
  const newName = `${baseName} (bản sao)`.slice(0, 80);
  const fingerprint = autosaveFingerprint(payload);

  const building = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateBuilding(
      current._id,
      { total_floors: to },
      scope,
      { session }
    );
    await repository.upsertFloorName(
      current._id,
      newFloorNumber,
      newName,
      input.actor?.userId,
      { session }
    );
    await repository.createFloorDraft({
      buildingId: current._id,
      floorNumber: newFloorNumber,
      payload,
      fingerprint,
      userId: input.actor?.userId || null
    }, { session });
    await recordMutation({
      action: 'DUPLICATE_FLOOR',
      building: updated,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: 'Nhân bản tầng',
        source_floor_number: sourceFloor,
        new_floor_number: newFloorNumber,
        changes: { total_floors: { from, to } }
      },
      session
    });
    return updated;
  }, options);

  return {
    status: 201,
    body: {
      message: `Đã nhân bản tầng ${sourceFloor} thành tầng ${newFloorNumber} (bản nháp).`,
      building,
      total_floors: to,
      new_floor_number: newFloorNumber,
      floor_name: newName,
      floors: floorRangeList(to)
    }
  };
}

async function changeActiveState(input, active, options = {}) {
  if (input.actor?.role === 'BUILDING_ADMIN') {
    fail(403, active
      ? 'Building Admin không được khôi phục tòa nhà. Liên hệ Org Admin hoặc Super Admin.'
      : 'Building Admin không được xóa tòa nhà. Liên hệ Org Admin hoặc Super Admin.');
  }
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  if ((current.is_active !== false) === active) {
    fail(400, active
      ? 'Tòa nhà đang hoạt động, không cần khôi phục.'
      : 'Tòa nhà đã được vô hiệu hóa trước đó!');
  }
  if (active && current.organization_id) {
    const organization = await repository.findOrganizationById(
      current.organization_id,
      { kind: 'SYSTEM' }
    );
    if (!organization) fail(400, 'Tổ chức của tòa nhà không tồn tại.');
    if (organization.is_active === false) {
      fail(400, `Không thể khôi phục tòa nhà khi tổ chức "${organization.name}" đang tạm dừng.`);
    }
    const quota = await assertCanCreateBuilding(organization);
    if (!quota.ok) fail(403, quota.message, quota.code, { usage: quota.usage });
  }
  const building = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateBuilding(
      current._id,
      { is_active: active },
      scope,
      { session }
    );
    await recordMutation({
      action: active ? 'ACTIVATE_BUILDING' : 'DEACTIVATE_BUILDING',
      building: updated,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: active
          ? 'Khôi phục tòa nhà (restore soft delete)'
          : 'Vô hiệu hóa tòa nhà (soft delete)',
        changes: { is_active: { from: !active, to: active } }
      },
      session
    });
    return updated;
  }, options);
  return {
    status: 200,
    body: active
      ? { message: 'Đã khôi phục tòa nhà thành công!', building }
      : { message: 'Đã vô hiệu hóa tòa nhà thành công!' }
  };
}

/**
 * F8 — Bật/tắt hiển thị public cho một tầng.
 * Body: { is_visible: boolean }
 */
async function setFloorVisibility(input, options = {}) {
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  await assertWritable(current, input.actor);

  const floorNumber = Number.parseInt(input.params.floorNumber, 10);
  if (!Number.isFinite(floorNumber)) {
    fail(400, 'floorNumber không hợp lệ.', 'FLOOR_INVALID');
  }
  try {
    assertFloorInRange(floorNumber, current.total_floors);
  } catch (e) {
    fail(e.status || 400, e.message, e.code || 'FLOOR_OUT_OF_RANGE', {
      floor_number: e.floor_number,
      total_floors: e.total_floors
    });
  }

  if (input.body?.is_visible === undefined) {
    fail(400, 'Thiếu is_visible (boolean).', 'FLOOR_VISIBILITY_REQUIRED');
  }
  const isVisible = Boolean(input.body.is_visible);

  const floor = await runCoreTenantCommand(async (session) => {
    const updated = await repository.updateFloorVisibility(
      current._id,
      floorNumber,
      isVisible,
      input.actor?.userId,
      { session }
    );
    await recordMutation({
      action: 'SET_FLOOR_VISIBILITY',
      building: current,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: isVisible ? 'Bật hiển thị tầng' : 'Ẩn tầng khỏi public',
        floor_number: floorNumber,
        is_visible: isVisible
      },
      session
    });
    return updated;
  }, options);

  return {
    status: 200,
    body: {
      message: isVisible ? 'Đã bật hiển thị tầng.' : 'Đã ẩn tầng khỏi public.',
      floor: {
        floor_number: floor.floor_number,
        floor_name: floor.floor_name,
        is_visible: floor.is_visible !== false,
        display_order: floor.display_order ?? null
      }
    }
  };
}

/**
 * F9 — Sắp xếp thứ tự hiển thị tầng (display_order). Không đổi floor_number.
 * Body: { order: number[] } — permutation 0..total_floors-1
 */
async function reorderFloors(input, options = {}) {
  const scope = await resolveBuildingScope(input.actor, input.params.id);
  const current = await repository.findBuildingById(input.params.id, scope);
  if (!current) fail(404, 'Không tìm thấy tòa nhà!');
  await assertWritable(current, input.actor);

  let order;
  try {
    order = validateFloorReorder(input.body?.order, current.total_floors);
  } catch (e) {
    fail(e.status || 400, e.message, e.code || 'FLOOR_REORDER_INVALID', {
      total_floors: current.total_floors
    });
  }

  await runCoreTenantCommand(async (session) => {
    await repository.updateFloorDisplayOrders(
      current._id,
      order,
      input.actor?.userId,
      { session }
    );
    await recordMutation({
      action: 'REORDER_FLOORS',
      building: current,
      actor: input.actor,
      ip: input.ip,
      details: {
        message: 'Sắp xếp lại thứ tự hiển thị tầng',
        order
      },
      session
    });
  }, options);

  return {
    status: 200,
    body: {
      message: 'Đã cập nhật thứ tự hiển thị tầng.',
      order,
      floors: order.map((floorNumber, index) => ({
        floor_number: floorNumber,
        display_order: index
      }))
    }
  };
}

const deactivateBuilding = (input, options) => changeActiveState(input, false, options);
const restoreBuilding = (input, options) => changeActiveState(input, true, options);

module.exports = {
  createBuilding,
  updateBuilding,
  patchFloors,
  renameFloor,
  duplicateFloor,
  setFloorVisibility,
  reorderFloors,
  deactivateBuilding,
  restoreBuilding,
  // F6 — helpers thuần cho unit test
  _cloneMapPayload: cloneMapPayload,
  _mapPayloadHasContent: mapPayloadHasContent
};
