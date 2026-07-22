const calls = [];

jest.mock('../../config/db', () => jest.fn(async () => {
  calls.push('connect');
}));
jest.mock('../../workers/domainEventWorker', () => ({
  startDomainEventWorker: jest.fn(() => {
    calls.push('start');
    return 'timer';
  }),
  stopDomainEventWorker: jest.fn()
}));
jest.mock('../../services/registerEventHandlers', () => ({
  registerEventHandlers: jest.fn(() => {
    calls.push('register');
  })
}));
jest.mock('../../shared/events/eventBus', () => ({
  assertRequiredHandlersRegistered: jest.fn(() => {
    calls.push('self-check');
    return true;
  })
}));

const { bootstrapDomainEventWorker } = require('../../workers/runDomainEventWorker');

describe('standalone domain-event worker bootstrap', () => {
  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  test('kết nối, đăng ký và self-check trước khi bắt đầu poll', async () => {
    await expect(bootstrapDomainEventWorker()).resolves.toBe('timer');
    expect(calls).toEqual(['connect', 'register', 'self-check', 'start']);
  });
});
