jest.mock('../../models/NotificationPreference', () => ({
  findOne: jest.fn()
}));
jest.mock('../../models/NotificationDelivery', () => ({}));
jest.mock('../../models/NotificationTemplate', () => ({}));
jest.mock('../../services/mailService', () => ({ getTransporter: jest.fn(() => null) }));

const NotificationPreference = require('../../models/NotificationPreference');
const eventBus = require('../../shared/events/eventBus');
const {
  redact,
  render,
  enabledChannels
} = require('../../services/notificationDispatcher');
const { processDelivery } = require('../../services/notificationDispatcher');
const { contextFromRequest } = require('../../services/auditService');

describe('event-platform core', () => {
  test('payload validation theo event type và backward-compatible type mới', () => {
    expect(() => eventBus.validatePayload('PaymentSucceeded', { invoice_id: 'i' }))
      .toThrow(/amount/);
    expect(eventBus.validatePayload('CustomEvent', { any: true }))
      .toEqual({ any: true });
  });

  test('transaction API truyền nguyên session cho business state và outbox', async () => {
    const session = { id: 'same-session' };
    const work = jest.fn(async (received) => received.id);
    await expect(eventBus.withOutboxTransaction(work, { session }))
      .resolves.toBe('same-session');
    expect(work).toHaveBeenCalledWith(session);
  });

  test('notification opt-out nhưng security luôn giữ IN_APP', async () => {
    NotificationPreference.findOne.mockReturnValueOnce({
      lean: async () => ({
        channels: { IN_APP: false, EMAIL: false, PUSH: true, SMS: false }
      })
    });
    await expect(enabledChannels('u1', 'MARKETING', ['IN_APP', 'EMAIL', 'PUSH']))
      .resolves.toEqual(['PUSH']);
    await expect(enabledChannels('u1', 'SECURITY', ['EMAIL'], true))
      .resolves.toEqual(['IN_APP', 'EMAIL']);
  });

  test('render và redaction không lộ OTP/secret', () => {
    expect(render('Xin chào {{user.name}}', { user: { name: 'An' } }))
      .toBe('Xin chào An');
    expect(redact({ otp: '123456', nested: { access_token: 'abc', ok: 1 } }))
      .toEqual({
        otp: '[REDACTED]',
        nested: { access_token: '[REDACTED]', ok: 1 }
      });
  });

  test('provider thiếu credential chuyển DEFERRED, không giả gửi thành công', async () => {
    const delivery = {
      channel: 'EMAIL',
      recipient: 'safe@example.test',
      rendered_payload: { subject: 'Test', body: 'No secret' },
      attempts: 1,
      save: jest.fn(async () => undefined)
    };
    await processDelivery(delivery);
    expect(delivery.status).toBe('DEFERRED');
    expect(delivery.last_error).toBe('SMTP_CREDENTIALS_MISSING');
    expect(delivery.save).toHaveBeenCalled();
  });

  test('audit context truyền request/correlation', () => {
    const context = contextFromRequest({
      user: { userId: 'u1', role: 'ORG_ADMIN', organization_id: 'o1' },
      requestId: 'r1',
      context: { correlationId: 'c1' },
      ip: '127.0.0.1',
      get: () => 'jest'
    });
    expect(context).toMatchObject({
      actor_id: 'u1',
      actor_role: 'ORG_ADMIN',
      request_id: 'r1',
      correlation_id: 'c1'
    });
  });
});
