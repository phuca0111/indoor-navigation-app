'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { encryptFile, sha256File } = require('./crypto');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => (
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))
    ));
  });
}

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function removeExpired(outputDir, retentionDays, now = Date.now()) {
  const cutoff = now - retentionDays * 86400000;
  for (const entry of await fsp.readdir(outputDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^indoor-nav-.*\.(enc|manifest\.json)$/.test(entry.name)) continue;
    const filePath = path.join(outputDir, entry.name);
    if ((await fsp.stat(filePath)).mtimeMs < cutoff) await fsp.unlink(filePath);
  }
}

async function createBackup({ dryRun = process.argv.includes('--dry-run') } = {}) {
  const environment = required('BACKUP_ENVIRONMENT').toLowerCase();
  if (!['test', 'staging', 'production'].includes(environment)) {
    throw new Error('BACKUP_ENVIRONMENT must be test, staging, or production');
  }
  const database = required('BACKUP_MONGO_DATABASE');
  const outputDir = path.resolve(process.env.BACKUP_OUTPUT_DIR || './backups');
  const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS) || 14);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const basename = `indoor-nav-${environment}-${timestamp}`;
  if (dryRun) {
    return { dry_run: true, database, output: path.join(outputDir, `${basename}.enc`) };
  }

  const passphrase = required('BACKUP_ENCRYPTION_PASSPHRASE');
  const mongoUri = required('MONGO_URI');
  await fsp.mkdir(outputDir, { recursive: true, mode: 0o700 });
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'indoor-nav-backup-'));
  const encryptedTemp = path.join(outputDir, `.${basename}.enc.tmp`);
  const encryptedFinal = path.join(outputDir, `${basename}.enc`);
  const manifestFinal = path.join(outputDir, `${basename}.manifest.json`);

  try {
    const mongoArchive = path.join(tempRoot, 'mongo.archive.gz');
    await run('mongodump', [`--uri=${mongoUri}`, `--db=${database}`, `--archive=${mongoArchive}`, '--gzip']);

    const minioSource = String(process.env.BACKUP_MINIO_SOURCE || '').trim();
    if (minioSource) {
      await fsp.mkdir(path.join(tempRoot, 'objects'));
      await run('mc', ['mirror', '--json', minioSource, path.join(tempRoot, 'objects')]);
    }

    const sourceManifest = {
      schema_version: 1,
      created_at: new Date().toISOString(),
      environment,
      mongo_database: database,
      includes_object_storage: Boolean(minioSource)
    };
    await fsp.writeFile(
      path.join(tempRoot, 'source-manifest.json'),
      `${JSON.stringify(sourceManifest, null, 2)}\n`,
      { mode: 0o600 }
    );
    const tarPath = path.join(os.tmpdir(), `${basename}.tar`);
    await run('tar', ['-cf', tarPath, '-C', tempRoot, '.']);
    const encryption = await encryptFile(tarPath, encryptedTemp, passphrase);
    await fsp.unlink(tarPath);
    const encryptedSha256 = await sha256File(encryptedTemp);
    const manifest = {
      ...sourceManifest,
      encryption,
      encrypted_sha256: encryptedSha256,
      artifact: path.basename(encryptedFinal)
    };
    await fsp.rename(encryptedTemp, encryptedFinal);
    await fsp.writeFile(manifestFinal, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
      mode: 0o600
    });
    await removeExpired(outputDir, retentionDays);
    return { artifact: encryptedFinal, manifest: manifestFinal, sha256: encryptedSha256 };
  } finally {
    await fsp.rm(tempRoot, { recursive: true, force: true });
    await fsp.rm(encryptedTemp, { force: true });
  }
}

if (require.main === module) {
  createBackup()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(`Backup failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { createBackup, removeExpired };
