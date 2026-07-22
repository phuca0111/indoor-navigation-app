/**
 * Registry ngoại lệ có chủ sở hữu trong giai đoạn strangler migration.
 *
 * Mỗi ngoại lệ phải trỏ tới một edge cụ thể, có lý do và phase chịu trách nhiệm
 * xóa. Không chấp nhận glob hoặc allowlist theo cả thư mục.
 */
const MIGRATED_BOUNDARIES = Object.freeze({
  phase2: Object.freeze({
    services: Object.freeze([
      'services/subscriptionLifecycle.js',
      'services/paymentCheckout.js',
      'services/paymentLedger.js',
      'services/webhookInboxService.js',
      'services/expenseLedger.js',
      'services/refundService.js',
      'services/receiptService.js',
      'services/unifiedLedger.js',
      'services/ledgerReadService.js',
      'services/reconciliationService.js',
      'services/planCatalog.js',
      'services/bankWalletService.js',
      'services/paymentSessionGuard.js',
      'services/personalPaymentService.js',
      'services/billingNotificationService.js',
      'services/billingScheduler.js',
      'services/registerEventHandlers.js',
      'services/paymentGateways/tptpGateway.js',
      'application/billing/subscriptionApplicationService.js',
      'application/billing/financeBillingApplicationService.js',
      'application/billing/financeOperationsApplicationService.js',
      'application/billing/financeExpenseApplicationService.js',
      'application/billing/financeAdminApplicationService.js',
      'application/billing/finalizeSuccessfulPayment.js',
      'application/billing/billingSelfServiceApplicationService.js',
      'application/billing/personalPaymentApplicationService.js',
      'application/billing/bankWalletApplicationService.js',
      'application/billing/runBillingCommand.js'
    ]),
    controllers: Object.freeze([
      'controllers/financeBillingController.js',
      'controllers/financeOperationsController.js',
      'controllers/financeController.js',
      'controllers/financeAdminController.js',
      'controllers/billingController.js',
      'controllers/tptpPayController.js',
      'controllers/tptpBankController.js'
    ])
  }),
  phase3: Object.freeze({
    services: Object.freeze([
      'application/coreTenant/buildingApplicationService.js',
      'application/coreTenant/buildingQueryService.js',
      'application/coreTenant/createOrganizationWithAdmin.js',
      'application/coreTenant/organizationApplicationService.js',
      'application/coreTenant/organizationQueryService.js',
      'application/coreTenant/publishedMapQueryService.js',
      'application/coreTenant/runCoreTenantCommand.js'
    ]),
    controllers: Object.freeze([
      'controllers/organizationController.js',
      'controllers/buildingController.js',
      'controllers/mapController.js'
    ])
  }),
  phase4: Object.freeze({
    services: Object.freeze([
      'application/mapLifecycle/draftApplicationService.js',
      'application/mapLifecycle/lockApplicationService.js',
      'application/mapLifecycle/mapLifecycleQueryService.js',
      'application/mapLifecycle/publishApplicationService.js',
      'application/mapLifecycle/rollbackApplicationService.js',
      'application/mapLifecycle/runMapLifecycleCommand.js',
      'services/draftService.js',
      'services/floorEditLock.js',
      'services/legacyMapLifecycleHttpService.js',
      'services/publishPermit.js',
      'services/publishService.js'
    ]),
    controllers: Object.freeze([
      'controllers/draftController.js',
      'controllers/floorLockController.js',
      'controllers/mapVersionController.js',
      'controllers/publishController.js'
    ])
  }),
  phase5: Object.freeze({
    services: Object.freeze([
      'application/identity/authApplicationService.js',
      'application/identity/identityApplicationService.js',
      'application/identity/identityQuotaPolicy.js',
      'application/identity/inviteApplicationService.js',
      'application/identity/joinApplicationService.js',
      'application/identity/membershipApplicationService.js',
      'application/identity/organizationUpgradeApplicationService.js',
      'application/identity/principalApplicationService.js',
      'application/identity/sessionApplicationService.js',
      'application/identity/userApplicationService.js',
      'application/identity/runIdentityCommand.js',
      'services/identityChallengeService.js',
      'services/refreshTokenService.js',
      'middlewares/auth.js'
    ]),
    controllers: Object.freeze([
      'controllers/authController.js',
      'controllers/userController.js',
      'controllers/identityController.js',
      'controllers/organizationMemberController.js',
      'controllers/orgInviteController.js',
      'controllers/orgJoinController.js'
    ])
  }),
  phase6: Object.freeze({
    services: Object.freeze([
      'application/content/runContentCommand.js',
      'application/content/mediaApplicationService.js',
      'application/content/cmsApplicationService.js',
      'application/content/formInboxQueryService.js',
      'application/notification/notificationApplicationService.js',
      'application/notification/notificationDeliveryApplicationService.js',
      'application/search/searchPolicy.js',
      'application/search/searchProviders.js',
      'application/search/searchApplicationService.js',
      'workers/cmsScheduler.js',
      'workers/notificationWorker.js'
    ]),
    controllers: Object.freeze([
      'controllers/websiteCmsController.js',
      'controllers/storageController.js',
      'controllers/notificationController.js',
      'controllers/searchController.js'
    ])
  }),
  phase7: Object.freeze({
    services: Object.freeze([
      'application/read/QueryScope.js',
      'application/read/readRoleMatrix.js',
      'application/read/readRollout.js',
      'application/read/readDateRange.js',
      'application/read/platformStatsQueryService.js',
      'application/read/financeReportsQueryService.js',
      'application/read/analyticsQueryService.js',
      'application/read/searchReadQueryService.js',
      'application/read/dashboardQueryService.js',
      'services/financeReports.js',
      'services/financeService.js',
      'services/analyticsService.js',
      'services/overviewDashboardService.js',
      'services/funnelService.js'
    ]),
    controllers: Object.freeze([
      'controllers/platformStatsController.js',
      'controllers/analyticsController.js',
      'controllers/overviewDashboardController.js',
      'controllers/financeController.js',
      'controllers/financeAdminController.js',
      'controllers/searchController.js'
    ])
  })
});

function readPersistenceExceptions(source, targets) {
  return targets.map((target) => Object.freeze({
    id: `phase7-read-${source.replace(/[^a-z0-9]+/gi, '-')}-${target}`,
    ownerPhase: 'phase7',
    kind: 'READ_MODEL_PERSISTENCE',
    source,
    target: `models/${target}.js`,
    reason: 'Controlled legacy read-model edge chờ migration Phase 7.'
  }));
}

const CONTROLLED_EXCEPTIONS = Object.freeze([
  Object.freeze({
    id: 'phase3-org-registration-controller-registration',
    ownerPhase: 'phase3',
    kind: 'LEGACY_COMMAND_PERSISTENCE',
    source: 'controllers/orgRegistrationController.js',
    target: 'models/OrganizationRegistration.js',
    reason: 'Organization onboarding registration aggregate thuộc Phase 3; edge đã tồn tại trước Phase 5.'
  }),
  Object.freeze({
    id: 'phase3-org-registration-controller-organization',
    ownerPhase: 'phase3',
    kind: 'LEGACY_COMMAND_PERSISTENCE',
    source: 'controllers/orgRegistrationController.js',
    target: 'models/Organization.js',
    reason: 'Organization onboarding availability check thuộc Phase 3; không chuyển owner sang Identity.'
  }),
  Object.freeze({
    id: 'phase3-org-registration-controller-user',
    ownerPhase: 'phase3',
    kind: 'LEGACY_COMMAND_PERSISTENCE',
    source: 'controllers/orgRegistrationController.js',
    target: 'models/User.js',
    reason: 'User uniqueness trong aggregate onboarding Phase 3; cần closure Phase 3 riêng.'
  }),
  Object.freeze({
    id: 'phase3-org-registration-controller-activity',
    ownerPhase: 'phase3',
    kind: 'LEGACY_COMMAND_PERSISTENCE',
    source: 'controllers/orgRegistrationController.js',
    target: 'models/ActivityLog.js',
    reason: 'Audit onboarding Phase 3 hiện chưa cùng transaction với registration transition.'
  }),
  Object.freeze({
    id: 'phase3-legacy-org-http-organization',
    ownerPhase: 'phase3',
    kind: 'LEGACY_CROSS_PHASE_PERSISTENCE',
    source: 'services/legacyOrganizationHttpService.js',
    target: 'models/Organization.js',
    reason: 'Compatibility organization read/command còn lại thuộc closure Phase 3.'
  }),
  Object.freeze({
    id: 'phase3-legacy-org-http-building',
    ownerPhase: 'phase3',
    kind: 'LEGACY_CROSS_PHASE_PERSISTENCE',
    source: 'services/legacyOrganizationHttpService.js',
    target: 'models/Building.js',
    reason: 'Compatibility organization/building projection thuộc Phase 3 closure.'
  }),
  Object.freeze({
    id: 'phase2-legacy-org-http-billing-event',
    ownerPhase: 'phase2',
    kind: 'LEGACY_CROSS_PHASE_PERSISTENCE',
    source: 'services/legacyOrganizationHttpService.js',
    target: 'models/OrganizationBillingEvent.js',
    reason: 'Legacy manual billing command/read còn thuộc Billing Phase 2 closure.'
  }),
  Object.freeze({
    id: 'phase2-legacy-org-http-invoice',
    ownerPhase: 'phase2',
    kind: 'LEGACY_CROSS_PHASE_PERSISTENCE',
    source: 'services/legacyOrganizationHttpService.js',
    target: 'models/Invoice.js',
    reason: 'Legacy invoice projection thuộc Billing Phase 2 closure.'
  }),
  Object.freeze({
    id: 'phase4-legacy-org-http-qr',
    ownerPhase: 'phase4',
    kind: 'LEGACY_CROSS_PHASE_PERSISTENCE',
    source: 'services/legacyOrganizationHttpService.js',
    target: 'models/QrCode.js',
    reason: 'Published map compatibility projection thuộc Map Lifecycle Phase 4.'
  }),
  Object.freeze({
    id: 'phase4-legacy-org-http-map-version',
    ownerPhase: 'phase4',
    kind: 'LEGACY_CROSS_PHASE_PERSISTENCE',
    source: 'services/legacyOrganizationHttpService.js',
    target: 'models/MapVersion.js',
    reason: 'Published map compatibility projection thuộc Map Lifecycle Phase 4.'
  }),
  ...[
    'Building', 'Organization', 'User', 'Place', 'Floor', 'Invoice',
    'CmsArticle', 'LandingMedia'
  ].map((target) => Object.freeze({
    id: `phase6-retired-search-provider-${target.toLowerCase()}`,
    ownerPhase: 'phase6',
    kind: 'RETIRED_PROVIDER_PERSISTENCE',
    source: 'services/searchProvider.js',
    target: `models/${target}.js`,
    reason: 'Provider cũ chỉ còn phục vụ characterization; route runtime đã chuyển sang application/search.'
  }))
]);

module.exports = { MIGRATED_BOUNDARIES, CONTROLLED_EXCEPTIONS };
