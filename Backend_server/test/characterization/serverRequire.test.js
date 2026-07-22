describe('server require contract', () => {
  test('trả về app nhưng không listen hoặc bootstrap worker', () => {
    const listen = jest.fn();
    const fakeApp = { listen };
    const createApp = jest.fn(() => fakeApp);
    const startServer = jest.fn();
    const installGracefulShutdown = jest.fn();

    jest.isolateModules(() => {
      jest.doMock('../../app', () => ({ createApp }));
      jest.doMock('../../bootstrap', () => ({ startServer, installGracefulShutdown }));

      const requiredApp = require('../../server');

      expect(requiredApp).toBe(fakeApp);
    });

    expect(createApp).toHaveBeenCalledTimes(1);
    expect(listen).not.toHaveBeenCalled();
    expect(startServer).not.toHaveBeenCalled();
    expect(installGracefulShutdown).not.toHaveBeenCalled();
  });
});
