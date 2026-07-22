'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');

const ALGORITHM = 'aes-256-gcm';
const HEADER_MAGIC = Buffer.from('INAVBK01');

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const input = fs.createReadStream(filePath);
    input.on('error', reject);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('end', () => resolve(hash.digest('hex')));
  });
}

function deriveKey(passphrase, salt) {
  if (String(passphrase || '').length < 24) {
    throw new Error('Backup passphrase must contain at least 24 characters.');
  }
  return crypto.scryptSync(passphrase, salt, 32);
}

async function encryptFile(inputPath, outputPath, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(passphrase, salt), iv);
  const header = Buffer.concat([HEADER_MAGIC, salt, iv]);
  const output = fs.createWriteStream(outputPath, { flags: 'wx', mode: 0o600 });
  output.write(header);
  await pipeline(fs.createReadStream(inputPath), cipher, output);
  const authTag = cipher.getAuthTag();
  fs.appendFileSync(outputPath, authTag);
  return { algorithm: ALGORITHM, salt: salt.toString('hex'), iv: iv.toString('hex') };
}

async function decryptFile(inputPath, outputPath, passphrase) {
  const stat = fs.statSync(inputPath);
  const headerLength = HEADER_MAGIC.length + 16 + 12;
  if (stat.size <= headerLength + 16) throw new Error('Encrypted backup is truncated.');
  const descriptor = fs.openSync(inputPath, 'r');
  const header = Buffer.alloc(headerLength);
  const authTag = Buffer.alloc(16);
  fs.readSync(descriptor, header, 0, headerLength, 0);
  fs.readSync(descriptor, authTag, 0, 16, stat.size - 16);
  fs.closeSync(descriptor);
  if (!header.subarray(0, HEADER_MAGIC.length).equals(HEADER_MAGIC)) {
    throw new Error('Backup header is invalid.');
  }
  const salt = header.subarray(HEADER_MAGIC.length, HEADER_MAGIC.length + 16);
  const iv = header.subarray(HEADER_MAGIC.length + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, deriveKey(passphrase, salt), iv);
  decipher.setAuthTag(authTag);
  await pipeline(
    fs.createReadStream(inputPath, { start: headerLength, end: stat.size - 17 }),
    decipher,
    fs.createWriteStream(outputPath, { flags: 'wx', mode: 0o600 })
  );
}

function assertRestoreTarget(environment, confirmationToken = '') {
  const target = String(environment || '').toLowerCase();
  if (target === 'test' || target === 'staging') return;
  if (target === 'production' && confirmationToken === 'CONFIRM_PRODUCTION_RESTORE') return;
  throw new Error('Restore target must be test/staging; production requires the explicit confirmation token.');
}

function assertNamespaceAllowed(namespace, allowlist) {
  const allowed = String(allowlist || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!allowed.includes(namespace)) throw new Error(`Restore namespace is not allowlisted: ${namespace}`);
}

module.exports = {
  ALGORITHM,
  sha256File,
  encryptFile,
  decryptFile,
  assertRestoreTarget,
  assertNamespaceAllowed
};
