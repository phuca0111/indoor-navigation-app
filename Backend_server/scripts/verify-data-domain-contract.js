/**
 * Verify hợp đồng domain/soft-delete — CHỈ ĐỌC schema (không ghi MongoDB).
 *
 * Usage:
 *   node scripts/verify-data-domain-contract.js
 */
const path = require('path');
const fs = require('fs');
const { listAllModelEntries } = require('../shared/persistence/dataDomainRegistry');

const modelsDir = path.join(__dirname, '..', 'models');

function modelFileExists(modelName) {
  return fs.existsSync(path.join(modelsDir, `${modelName}.js`));
}

function main() {
  const rows = listAllModelEntries();
  let missingFiles = 0;
  const byScope = {};

  console.log('=== Data domain contract verify (read-only) ===\n');

  for (const row of rows) {
    byScope[row.scope] = (byScope[row.scope] || 0) + 1;
    const exists = modelFileExists(row.modelName);
    if (!exists) {
      missingFiles += 1;
      console.warn(`[MISSING FILE] ${row.domainId}/${row.modelName}`);
    }
  }

  console.log('Models in registry:', rows.length);
  console.log('By scope:');
  Object.entries(byScope)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([scope, n]) => console.log(`  ${scope}: ${n}`));

  console.log('\nSoft conventions:');
  const softCounts = {};
  rows.forEach((r) => {
    const key = r.soft || '(none)';
    softCounts[key] = (softCounts[key] || 0) + 1;
  });
  Object.entries(softCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([k, n]) => console.log(`  ${k}: ${n}`));

  if (missingFiles) {
    console.error(`\nFAIL: ${missingFiles} model file(s) missing under models/`);
    process.exit(1);
  }

  console.log('\nOK: registry files present. No database writes performed.');
  console.log('Reminder: Place = GLOBAL_REGISTRY; Building = PERSONAL_OR_ORG; CMS soft = deleted_at.');
}

main();
