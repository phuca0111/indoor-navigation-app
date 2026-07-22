jest.mock('../../repositories/coreTenantRepository', () => ({
  findBuildingById: jest.fn(),
  updateBuilding: jest.fn(),
  findOrganizationById: jest.fn(),
  updateOrganization: jest.fn(),
  findUserScope: jest.fn(),
  findFloorAt: jest.fn(),
  createBuilding: jest.fn()
}));
jest.mock('../../repositories/activityLogRepository', () => ({
  recordActivity: jest.fn()
}));
jest.mock('../../shared/events/eventBus', () => ({
  publish: jest.fn()
}));

const repository = require('../../repositories/coreTenantRepository');
const activities = require('../../repositories/activityLogRepository');
const eventBus = require('../../shared/events/eventBus');
const buildings = require('../../application/coreTenant/buildingApplicationService');
const organizations = require('../../application/coreTenant/organizationApplicationService');

describe('Phase 3 Application Service — UoW propagation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('deactivate building ghi state, Activity và Outbox cùng session', async () => {
    const session = { id: 'session-building' };
    const current = {
      _id: 'building-a',
      name: 'A',
      organization_id: 'org-a',
      is_active: true
    };
    const updated = { ...current, is_active: false };
    repository.findBuildingById.mockResolvedValue(current);
    repository.updateBuilding.mockResolvedValue(updated);

    const result = await buildings.deactivateBuilding({
      actor: { role: 'SUPER_ADMIN', userId: 'super-a' },
      params: { id: 'building-a' },
      body: {},
      ip: '127.0.0.1'
    }, { session });

    expect(result.status).toBe(200);
    expect(repository.updateBuilding).toHaveBeenCalledWith(
      'building-a',
      { is_active: false },
      { kind: 'SYSTEM' },
      { session }
    );
    expect(activities.recordActivity.mock.calls[0][1]).toEqual({ session });
    expect(eventBus.publish.mock.calls[0][1]).toEqual({ session });
  });

  test('deactivate organization ghi state, Activity và Outbox cùng session', async () => {
    const session = { id: 'session-organization' };
    const current = {
      _id: 'org-a',
      name: 'Org A',
      slug: 'org-a',
      is_active: true
    };
    repository.findOrganizationById.mockResolvedValue(current);
    repository.updateOrganization.mockResolvedValue({
      ...current,
      is_active: false
    });

    const result = await organizations.updateOrganization({
      actor: { role: 'SUPER_ADMIN', userId: 'super-a' },
      params: { id: 'org-a' },
      body: { is_active: false },
      ip: '127.0.0.1'
    }, { session });

    expect(result.status).toBe(200);
    expect(repository.updateOrganization.mock.calls[0][3]).toEqual({ session });
    expect(activities.recordActivity.mock.calls[0][1]).toEqual({ session });
    expect(eventBus.publish.mock.calls[0][1]).toEqual({ session });
  });
});
