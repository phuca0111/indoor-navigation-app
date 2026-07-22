const bcrypt = require('bcryptjs');
const {
  allowLegacyPlaintextPassword,
  verifyPasswordAndUpgrade
} = require('../../services/passwordAuth');

describe('password authentication legacy gate', () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    ALLOW: process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORD
  };

  afterEach(() => {
    process.env.NODE_ENV = originalEnv.NODE_ENV;
    if (originalEnv.ALLOW === undefined) delete process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORD;
    else process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORD = originalEnv.ALLOW;
  });

  test('production luôn từ chối plaintext dù env bật', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORD = 'true';
    expect(allowLegacyPlaintextPassword()).toBe(false);
    const user = { password: 'LegacySecret1!', save: jest.fn() };
    expect(await verifyPasswordAndUpgrade(user, 'LegacySecret1!')).toEqual({ ok: false, upgraded: false });
    expect(user.save).not.toHaveBeenCalled();
  });

  test('dev explicit rehash ngay khi plaintext đúng', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_LEGACY_PLAINTEXT_PASSWORD = 'true';
    const user = { password: 'LegacySecret1!', save: jest.fn().mockResolvedValue(undefined) };
    expect(await verifyPasswordAndUpgrade(user, 'LegacySecret1!')).toEqual({ ok: true, upgraded: true });
    expect(await bcrypt.compare('LegacySecret1!', user.password)).toBe(true);
    expect(user.save).toHaveBeenCalledTimes(1);
  });
});
