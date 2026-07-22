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
  clampCreateTotalFloors
} = require('../../services/floorLifecycle');
const policy = require('./coreTenantPolicy');
const { runCoreTenantCommand } = require('./runCoreTenantCommand');

function fail(status, message, code, details) {
  throw Object.assign(new Error(message), { status, code, details });
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
        place_auto_created: placeResolved.auto_created
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
    changes.gps_location = {
      lat: input.body.lat ?? current.gps_location?.lat,
      lng: input.body.lng ?? current.gps_location?.lng
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
      if (existing) {
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
    if (floor) {
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

const deactivateBuilding = (input, options) => changeActiveState(input, false, options);
const restoreBuilding = (input, options) => changeActiveState(input, true, options);

module.exports = {
  createBuilding,
  updateBuilding,
  patchFloors,
  deactivateBuilding,
  restoreBuilding
};
