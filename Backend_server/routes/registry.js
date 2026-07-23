const express = require('express');
const { validate, loginBodySchema, refreshBodySchema, searchQuerySchema } = require('../middlewares/validate');

const routes = {
  auth: require('./authRoutes'),
  buildings: require('./buildingRoutes'),
  maps: require('./mapRoutes'),
  users: require('./userRoutes'),
  organizations: require('./organizationRoutes'),
  search: require('./searchRoutes'),
  qr: require('./qrRoutes'),
  activityLogs: require('./activityLogRoutes'),
  audits: require('./auditRoutes'),
  mapVersions: require('./mapVersionRoutes'),
  orgRegistrations: require('./orgRegistrationRoutes'),
  orgJoinRequests: require('./orgJoinRoutes'),
  orgInvites: require('./orgInviteRoutes'),
  platform: require('./platformStatsRoutes'),
  billing: require('./billingRoutes'),
  webhooks: require('./webhookRoutes'),
  tptpPay: require('./tptpPayRoutes'),
  tptpBank: require('./tptpBankRoutes'),
  analytics: require('./analyticsRoutes'),
  finance: require('./financeRoutes'),
  overview: require('./overviewRoutes'),
  draft: require('./draftRoutes'),
  floorLock: require('./floorLockRoutes'),
  publish: require('./publishRoutes'),
  storage: require('./storageRoutes'),
  contact: require('./contactRoutes'),
  places: require('./placeRoutes'),
  proposals: require('./proposalRoutes'),
  moderation: require('./moderationRoutes'),
  workspaces: require('./workspaceRoutes'),
  indoorWorkspaces: require('./indoorWorkspaceRoutes'),
  hub: require('./hubRoutes'),
  mapReviews: require('./mapReviewRoutes'),
  placeOwnership: require('./placeOwnershipRoutes'),
  placeMerges: require('./placeMergeRoutes'),
  mapModeration: require('./mapModerationRoutes'),
  community: require('./communityRoutes'),
  notifications: require('./notificationRoutes'),
  eventAdmin: require('./eventAdminRoutes'),
  featureFlags: require('./featureFlagRoutes'),
  health: require('./healthRoutes'),
  website: require('./websiteRoutes')
};

function createV1AliasRouter() {
  const router = express.Router();

  router.post('/auth/login', validate(loginBodySchema));
  router.post('/auth/refresh', validate(refreshBodySchema));
  router.get('/search', validate(searchQuerySchema, 'query'));

  router.use('/auth', routes.auth);
  router.use('/users', routes.users);
  router.use('/organizations', routes.organizations);
  router.use('/org-invites', routes.orgInvites);
  router.use('/org-join-requests', routes.orgJoinRequests);
  router.use('/buildings', routes.buildings);
  router.use('/maps', routes.maps);
  router.use('/search', routes.search);
  return router;
}

function mountRoutes(app, middleware = {}) {
  app.use(middleware.requestMetrics);
  app.use('/api', routes.health);
  middleware.registerEventHandlers();
  app.use(middleware.maintenanceMode);

  app.use('/api/auth', routes.auth);
  app.use('/api/buildings', routes.buildings);
  app.use('/api/places', routes.places);
  app.use('/api/proposals', routes.proposals);
  app.use('/api/moderation', routes.moderation);
  app.use('/api/workspaces', routes.workspaces);
  app.use('/api/indoor-workspaces', routes.indoorWorkspaces);
  app.use('/api/hub', routes.hub);
  app.use('/api/map-reviews', routes.mapReviews);
  app.use('/api/place-ownership', routes.placeOwnership);
  app.use('/api/place-merges', routes.placeMerges);
  app.use('/api/map-moderation', routes.mapModeration);
  app.use('/api/community', routes.community);
  app.use('/api/v1', routes.draft);
  app.use('/api/v1', routes.floorLock);
  app.use('/api/v1', routes.publish);
  app.use('/api/v1', routes.storage);
  app.use('/api/v1', createV1AliasRouter());
  app.use('/uploads', express.static(middleware.uploadRoot));

  app.use('/api/maps', routes.maps);
  app.use('/api/users', routes.users);
  app.use('/api/qr', routes.qr);
  app.use('/api/activity-logs', routes.activityLogs);
  app.use('/api/audit-logs', routes.audits);
  app.use('/api/map-versions', routes.mapVersions);
  app.use('/api/organizations', routes.organizations);
  app.use('/api/org-registrations', routes.orgRegistrations);
  app.use('/api/org-join-requests', routes.orgJoinRequests);
  app.use('/api/org-invites', routes.orgInvites);
  app.use('/api/platform', routes.platform);
  app.use('/api/billing', routes.billing);
  app.use('/api/contact', routes.contact);
  app.use('/api/webhooks', routes.webhooks);
  app.use('/api/tptp-pay', routes.tptpPay);
  app.use('/api/tptp-bank', routes.tptpBank);
  app.use('/api/analytics', routes.analytics);
  app.use('/api/finance', routes.finance);
  app.use('/api/overview', routes.overview);
  app.use('/api/notifications', routes.notifications);
  app.use('/api/admin/events', routes.eventAdmin);
  app.use('/api/search', routes.search);
  app.use('/api/feature-flags', routes.featureFlags);
  app.use('/api/website', routes.website);
  app.use('/tptp-pay', routes.tptpPay);
}

module.exports = { createV1AliasRouter, mountRoutes, routes };
