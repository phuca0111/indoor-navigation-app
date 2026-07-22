const EVENT_TYPES = require('./eventTypes');

/**
 * Handler bắt buộc theo event type.
 *
 * Manifest này độc lập với registry in-memory để worker có thể phát hiện lỗi
 * bootstrap thay vì đánh COMPLETED cho event chưa hề có subscriber.
 */
const REQUIRED_EVENT_HANDLERS = Object.freeze({
  [EVENT_TYPES.PUBLISH_REQUESTED]: Object.freeze([
    'publish.relay-bullmq'
  ]),
  [EVENT_TYPES.MAP_POST_COMMIT]: Object.freeze([
    'map.post-commit-maintenance'
  ]),
  [EVENT_TYPES.PAYMENT_SUCCEEDED]: Object.freeze([
    'notification.payment-succeeded',
    `analytics.funnel.${EVENT_TYPES.PAYMENT_SUCCEEDED}`
  ]),
  [EVENT_TYPES.SUBSCRIPTION_EXPIRED]: Object.freeze([
    'notification.subscription-expired'
  ]),
  [EVENT_TYPES.MAP_PUBLISHED]: Object.freeze([
    'notification.map-published',
    `analytics.funnel.${EVENT_TYPES.MAP_PUBLISHED}`
  ]),
  [EVENT_TYPES.REFUND_COMPLETED]: Object.freeze([
    'notification.refund-completed'
  ]),
  [EVENT_TYPES.TRIAL_STARTED]: Object.freeze([
    `analytics.funnel.${EVENT_TYPES.TRIAL_STARTED}`
  ]),
  [EVENT_TYPES.CHECKOUT_STARTED]: Object.freeze([
    `analytics.funnel.${EVENT_TYPES.CHECKOUT_STARTED}`
  ]),
  [EVENT_TYPES.SUBSCRIPTION_ACTIVATED]: Object.freeze([
    `analytics.funnel.${EVENT_TYPES.SUBSCRIPTION_ACTIVATED}`
  ]),
  [EVENT_TYPES.NAVIGATION_COMPLETED]: Object.freeze([
    `analytics.funnel.${EVENT_TYPES.NAVIGATION_COMPLETED}`
  ]),
  [EVENT_TYPES.CMS_CONTENT_CHANGED]: Object.freeze([
    'search.project-cms-content'
  ]),
  [EVENT_TYPES.MEDIA_CHANGED]: Object.freeze([
    'search.project-media'
  ])
});

module.exports = { REQUIRED_EVENT_HANDLERS };
