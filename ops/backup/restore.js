'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const {
  sha256File,
  decryptFile,
  assertRestoreTarget,
  assertNamespaceAllowed
} = require('./crypto');

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    const child = spawn(command, args, { stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    if (capture) child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', reject);
    child.on('exit', (code) => (
      code === 0 ? resolve(stdout.trim()) : reject(new Error(`${command} exited with code ${code}`))
    ));
  });
}

function argument(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : '';
}

async function restore({ dryRun = process.argv.includes('--dry-run') } = {}) {
  const artifactArg = argument('artifact');
  const manifestArg = argument('manifest');
  const targetEnvironment = argument('target-environment');
  const targetDatabase = argument('target-database');
  const overwrite = process.argv.includes('--allow-overwrite');
  if (!artifactArg || !manifestArg || !targetDatabase) {
    throw new Error('artifact, manifest and target-database are required');
  }
  const artifact = path.resolve(artifactArg);
  const manifestPath = path.resolve(manifestArg);
  assertRestoreTarget(targetEnvironment, argument('confirm-token'));
  assertNamespaceAllowed(targetDatabase, process.env.RESTORE_NAMESPACE_ALLOWLIST);

  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  if (manifest.artifact !== path.basename(artifact)) throw new Error('Manifest artifact name does not match.');
  const checksum = await sha256File(artifact);
  if (checksum !== manifest.encrypted_sha256) throw new Error('Encrypted backup SHA-256 mismatch.');
  if (dryRun) return { dry_run: true, checksum_verified: true, targetDatabase, overwrite };

  const passphrase = String(process.env.BACKUP_ENCRYPTION_PASSPHRASE || '');
  const mongoUri = String(process.env.MONGO_URI || '');
  if (!mongoUri) throw new Error('MONGO_URI is required');
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'indoor-nav-restore-'));
  const tarPath = path.join(tempRoot, 'backup.tar');
  const extractPath = path.join(tempRoot, 'extract');
  await fsp.mkdir(extractPath);
  try {
    await decryptFile(artifact, tarPath, passphrase);
    await run('tar', ['-xf', tarPath, '-C', extractPath]);
    const source = JSON.parse(await fsp.readFile(path.join(extractPath, 'source-manifest.json'), 'utf8'));
    if (source.mongo_database !== manifest.mongo_database) throw new Error('Inner manifest does not match outer manifest.');

    if (!overwrite) {
      const count = await run('mongosh', [
        mongoUri,
        '--quiet',
        '--eval',
        `db.getSiblingDB(${JSON.stringify(targetDatabase)}).getCollectionNames().length`
      ], { capture: true });
      if (Number(count) > 0) throw new Error('Target database is not empty; use --allow-overwrite only after approval.');
    }

    const restoreArgs = [
      `--uri=${mongoUri}`,
      `--archive=${path.join(extractPath, 'mongo.archive.gz')}`,
      '--gzip',
      `--nsFrom=${manifest.mongo_database}.*`,
      `--nsTo=${targetDatabase}.*`
    ];
    if (overwrite) restoreArgs.push('--drop');
    await run('mongorestore', restoreArgs);

    const objectTarget = String(process.env.RESTORE_MINIO_TARGET || '').trim();
    const objectPath = path.join(extractPath, 'objects');
    if (objectTarget && fs.existsSync(objectPath)) {
      if (!overwrite) {
        const existing = await run('mc', ['find', objectTarget, '--maxdepth', '1'], { capture: true });
        if (existing) throw new Error('Object target is not empty; restore refused.');
      }
      await run('mc', ['mirror', ...(overwrite ? ['--overwrite'] : []), objectPath, objectTarget]);
    }
    return { restored: true, targetDatabase, checksum_verified: true };
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  restore()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(`Restore failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { restore };
