describe('Phase 6 worker entrypoints', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('require standalone notification worker không tự kết nối', async () => {
    const connectDB = jest.fn().mockResolvedValue(undefined);
    const start = jest.fn();
    jest.doMock('../../config/db', () => connectDB);
    jest.doMock('../../workers/notificationWorker', () => ({
      startNotificationWorker: start,
      stopNotificationWorker: jest.fn()
    }));
    const runner = require('../../workers/runNotificationWorker');
    expect(connectDB).not.toHaveBeenCalled();
    await runner.main();
    expect(connectDB).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
  });

  test('CMS scheduler chặn tick chồng lấn trong cùng process', async () => {
    let release;
    const promote = jest.fn(() => new Promise((resolve) => {
      release = resolve;
    }));
    const recover = jest.fn().mockResolvedValue({});
    const reconcile = jest.fn().mockResolvedValue({});
    jest.doMock('../../application/content/cmsApplicationService', () => ({
      promoteDueArticles: promote
    }));
    jest.doMock('../../application/content/mediaApplicationService', () => ({
      recoverStaleUploads: recover,
      reconcileAssets: reconcile
    }));
    const { tick } = require('../../workers/cmsScheduler');
    const first = tick();
    const second = tick();
    expect(promote).toHaveBeenCalledTimes(1);
    release({ promoted: 1 });
    await Promise.all([first, second]);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(1);
  });
});
