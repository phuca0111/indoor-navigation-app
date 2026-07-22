'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const registryPath = path.join(__dirname, 'registry.json');

function checksum(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function loadRegistry() {
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function inspect() {
  const registry = loadRegistry();
  return registry.migrations.map((migration) => {
    const absolute = path.join(root, migration.file);
    const actual = fs.existsSync(absolute) ? checksum(absolute) : null;
    return {
      id: migration.id,
      file: migration.file,
      expected: migration.checksum,
      actual,
      valid: actual === migration.checksum,
      rollback: migration.rollback
    };
  });
}

function main() {
  const command = process.argv[2] || 'status';
  const rows = inspect();
  if (command === 'status') {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (command === 'checksums') {
    rows.forEach((row) => console.log(`${row.actual || 'MISSING'}  ${row.id}`));
    return;
  }
  if (command === 'verify') {
    const invalid = rows.filter((row) => !row.valid);
    if (invalid.length) {
      console.error(JSON.stringify(invalid, null, 2));
      process.exitCode = 1;
    } else {
      console.log(`Verified ${rows.length} migration checksums.`);
    }
    return;
  }
  throw new Error('Usage: node ops/migrations/cli.js [status|checksums|verify]');
}

if (require.main === module) main();

module.exports = { checksum, inspect };
