function requireSafeMigrationUri() {
  const uri = process.env.TEST_MONGO_URI || process.env.MIGRATION_MONGO_URI;
  if (!uri) throw new Error('Thiếu TEST_MONGO_URI/MIGRATION_MONGO_URI; không dùng MONGO_URI mặc định.');
  const databaseName = uri.split('?')[0].split('/').pop();
  if (!databaseName || !/(test|staging|migration|sandbox)/i.test(databaseName)) {
    throw new Error('URI migration phải trỏ đến database test/staging/migration/sandbox rõ ràng.');
  }
  return uri;
}

module.exports = { requireSafeMigrationUri };
