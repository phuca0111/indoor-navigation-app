const lifecycle = require('../../repositories/mapLifecycleRepository');
const versions = require('../../repositories/mapVersionRepository');
const jobs = require('../../repositories/publishJobRepository');
const { getRetentionMax } = require('../../utils/mapVersionRetention');

async function listVersions(buildingId, floorNumber) {
  const [rows, floor] = await Promise.all([
    versions.list(buildingId, floorNumber),
    lifecycle.findPublishedFloor(buildingId, floorNumber)
  ]);
  return {
    current_version: floor?.version ?? null,
    retention: { max_per_floor: getRetentionMax(), stored_count: rows.length },
    versions: rows.map((row) => ({
      _id: row._id,
      building_id: row.building_id,
      floor_number: row.floor_number,
      version: row.version,
      rooms_count: row.rooms_count,
      nodes_count: row.nodes_count,
      edges_count: row.edges_count,
      published_by: row.published_by,
      published_at: row.published_at,
      has_full_snapshot: Boolean(row.map_snapshot && Array.isArray(row.map_snapshot.rooms))
    }))
  };
}

async function versionDetail(buildingId, floorNumber, version) {
  return versions.findSnapshot(buildingId, floorNumber, version);
}

async function getJob(jobId) {
  return jobs.findById(jobId);
}

async function listJobs(filter, limit) {
  return jobs.list(filter, limit);
}

async function listAccessibleJobs(actor, filter, limit) {
  const scoped = { ...filter };
  if (actor?.role !== 'SUPER_ADMIN') {
    if (actor?.organization_id) {
      const buildings = await lifecycle.listBuildingIdsForOrganization(actor.organization_id);
      scoped.building_ids = buildings.map((building) => building._id);
    } else {
      scoped.requested_by = actor?.userId;
    }
  }
  return jobs.list(scoped, limit);
}

async function canAccessJob(actor, job) {
  if (actor?.role === 'SUPER_ADMIN') return true;
  if (String(job.requested_by?._id || job.requested_by) === String(actor?.userId)) return true;
  const building = await lifecycle.findBuilding(job.building_id?._id || job.building_id);
  return Boolean(
    building?.organization_id &&
    actor?.organization_id &&
    String(building.organization_id) === String(actor.organization_id)
  );
}

module.exports = {
  listVersions,
  versionDetail,
  getJob,
  listJobs,
  listAccessibleJobs,
  canAccessJob
};
