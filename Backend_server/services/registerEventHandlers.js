const eventBus = require('../shared/events/eventBus');
const EVENT_TYPES = require('../shared/events/eventTypes');
const invoiceRepository = require('../repositories/invoiceRepository');
const subscriptionRepository = require('../repositories/subscriptionRepository');
const billingOrganizationRepository = require('../repositories/billingOrganizationRepository');
const { recordDomainEvent } = require('./funnelService');
const {
  createForOrganization,
  createForPlatformAdmins,
  platformEventNotification
} = require('../application/notification/notificationApplicationService');
const {
  projectContentEvent
} = require('../application/search/searchApplicationService');
const publishQueue = require('./publishQueue');
const mapVersions = require('../repositories/mapVersionRepository');
const publicMapCache = require('./publicMapCache');
const { getRetentionMax } = require('../utils/mapVersionRetention');

let registered = false;

function registerEventHandlers() {
  if (registered) return;
  registered = true;

  eventBus.subscribe(
    EVENT_TYPES.PUBLISH_REQUESTED,
    'publish.relay-bullmq',
    async (event) => {
      await publishQueue.enqueuePublishWork(event.payload.publish_job_id);
    }
  );

  eventBus.subscribe(
    EVENT_TYPES.MAP_POST_COMMIT,
    'map.post-commit-maintenance',
    async (event) => {
      await Promise.all([
        publicMapCache.invalidate(
          event.payload.building_id,
          event.payload.floor_number
        ),
        mapVersions.trimOldest(
          event.payload.building_id,
          event.payload.floor_number,
          getRetentionMax()
        )
      ]);
    }
  );

  eventBus.subscribe(
    EVENT_TYPES.PAYMENT_SUCCEEDED,
    'notification.payment-succeeded',
    async (event) => {
      const invoice = await invoiceRepository.findById(event.payload?.invoice_id);
      const org = await billingOrganizationRepository
        .findBillingOrganizationById(event.organization_id);
      if (!invoice || !org) return;
      await createForOrganization(org._id, {
        type: EVENT_TYPES.PAYMENT_SUCCEEDED,
        title: 'Thanh toán thành công',
        body: `Gói ${invoice.plan} đã được kích hoạt/gia hạn.`,
        severity: 'success',
        link: '#billing',
        event_id: event.event_id,
        dedupe_key: `payment-succeeded:${invoice._id}`,
        data: { invoice_id: String(invoice._id), amount: invoice.amount },
        category: 'BILLING',
        channels: ['IN_APP', 'EMAIL'],
        template_key: 'PAYMENT_SUCCEEDED'
      });
      await createForPlatformAdmins(platformEventNotification(event));
    }
  );

  eventBus.subscribe(
    EVENT_TYPES.SUBSCRIPTION_EXPIRED,
    'notification.subscription-expired',
    async (event) => {
      const subscription = await subscriptionRepository.findById(
        event.payload?.subscription_id || event.aggregate_id
      );
      const org = await billingOrganizationRepository
        .findBillingOrganizationById(event.organization_id);
      if (!subscription || !org) return;
      await createForOrganization(org._id, {
        type: EVENT_TYPES.SUBSCRIPTION_EXPIRED,
        title: 'Gói dịch vụ đã hết hạn',
        body: `Gói ${subscription.plan} đã hết hạn. Dữ liệu vẫn được bảo toàn.`,
        severity: 'warning',
        link: '#billing',
        event_id: event.event_id,
        dedupe_key: event.event_key,
        data: { subscription_id: String(subscription._id) },
        category: 'BILLING',
        channels: ['IN_APP'],
        template_key: 'SUBSCRIPTION_EXPIRED'
      });
      await createForPlatformAdmins(platformEventNotification(event));
    }
  );

  eventBus.subscribe(
    EVENT_TYPES.MAP_PUBLISHED,
    'notification.map-published',
    async (event) => {
      if (!event.organization_id) return;
      await createForOrganization(event.organization_id, {
        type: EVENT_TYPES.MAP_PUBLISHED,
        title: 'Bản đồ đã xuất bản',
        body: `Tầng ${event.payload?.floor_number}, phiên bản ${event.payload?.version}.`,
        severity: 'success',
        link: '#buildings',
        event_id: event.event_id,
        dedupe_key: event.event_key,
        data: event.payload || {}
      });
      await createForPlatformAdmins(platformEventNotification(event));
    }
  );

  eventBus.subscribe(
    EVENT_TYPES.REFUND_COMPLETED,
    'notification.refund-completed',
    async (event) => {
      if (!event.organization_id) return;
      await createForOrganization(event.organization_id, {
        type: EVENT_TYPES.REFUND_COMPLETED,
        title: 'Hoàn tiền thành công',
        body: `Đã hoàn ${Number(event.payload?.amount || 0).toLocaleString('vi-VN')} VND qua ${event.payload?.provider || 'gateway'}.`,
        severity: 'info',
        link: '#billing',
        event_id: event.event_id,
        dedupe_key: event.event_key,
        data: event.payload || {}
      });
      await createForPlatformAdmins(platformEventNotification(event));
    }
  );

  [
    EVENT_TYPES.PAYMENT_SUCCEEDED,
    EVENT_TYPES.MAP_PUBLISHED,
    EVENT_TYPES.TRIAL_STARTED,
    EVENT_TYPES.CHECKOUT_STARTED,
    EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
    EVENT_TYPES.NAVIGATION_COMPLETED
  ].forEach((type) => {
    eventBus.subscribe(type, `analytics.funnel.${type}`, recordDomainEvent);
  });

  eventBus.subscribe(
    EVENT_TYPES.CMS_CONTENT_CHANGED,
    'search.project-cms-content',
    projectContentEvent
  );
  eventBus.subscribe(
    EVENT_TYPES.MEDIA_CHANGED,
    'search.project-media',
    projectContentEvent
  );
}

function resetRegistrationForTests() {
  registered = false;
}

module.exports = { registerEventHandlers, resetRegistrationForTests };
