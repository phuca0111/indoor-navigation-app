const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  encryptFile,
  decryptFile,
  sha256File,
  assertRestoreTarget,
  assertNamespaceAllowed
} = require('../../../ops/backup/crypto');

describe('backup encryption and restore guards', () => {
  let temp;
  beforeEach(() => { temp = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-')); });
  afterEach(() => fs.rmSync(temp, { recursive: true, force: true }));

  test('round-trips AES-256-GCM and produces SHA-256', async () => {
    const source = path.join(temp, 'source.bin');
    const encrypted = path.join(temp, 'backup.enc');
    const restored = path.join(temp, 'restored.bin');
    fs.writeFileSync(source, Buffer.from('portable-backup-fixture'));
    await encryptFile(source, encrypted, 'test-passphrase-with-more-than-24-characters');
    expect(await sha256File(encrypted)).toMatch(/^[a-f0-9]{64}$/);
    await decryptFile(encrypted, restored, 'test-passphrase-with-more-than-24-characters');
    expect(fs.readFileSync(restored)).toEqual(fs.readFileSync(source));
  });

  test('detects tampering through GCM authentication', async () => {
    const source = path.join(temp, 'source.bin');
    const encrypted = path.join(temp, 'backup.enc');
    const restored = path.join(temp, 'restored.bin');
    fs.writeFileSync(source, 'sensitive backup');
    await encryptFile(source, encrypted, 'test-passphrase-with-more-than-24-characters');
    const bytes = fs.readFileSync(encrypted);
    bytes[bytes.length - 20] ^= 1;
    fs.writeFileSync(encrypted, bytes);
    await expect(decryptFile(
      encrypted,
      restored,
      'test-passphrase-with-more-than-24-characters'
    )).rejects.toThrow();
  });

  test('allows drills only in safe targets by default', () => {
    expect(() => assertRestoreTarget('staging')).not.toThrow();
    expect(() => assertRestoreTarget('test')).not.toThrow();
    expect(() => assertRestoreTarget('production')).toThrow();
    expect(() => assertRestoreTarget('production', 'CONFIRM_PRODUCTION_RESTORE')).not.toThrow();
  });

  test('requires an allowlisted restore namespace', () => {
    expect(() => assertNamespaceAllowed('indoor_nav_test', 'indoor_nav_test,indoor_nav_staging')).not.toThrow();
    expect(() => assertNamespaceAllowed('development', 'indoor_nav_test')).toThrow('not allowlisted');
  });
});
