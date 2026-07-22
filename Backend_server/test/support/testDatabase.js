function getDatabaseName(mongoUri) {
  if (!mongoUri || typeof mongoUri !== 'string') return '';

  try {
    const parsed = new URL(mongoUri);
    if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) return '';
    return decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ''));
  } catch {
    return '';
  }
}

function isSafeTestMongoUri(mongoUri) {
  const databaseName = getDatabaseName(mongoUri).toLowerCase();
  return databaseName.endsWith('_test') || databaseName.includes('_test_');
}

function assertSafeTestMongoUri(mongoUri) {
  if (!isSafeTestMongoUri(mongoUri)) {
    throw new Error(
      'Từ chối chạy integration test: Mongo URI phải có database name kết thúc bằng "_test" hoặc chứa "_test_".'
    );
  }
  return mongoUri;
}

function resolveTestMongoUri(env = process.env) {
  const mongoUri = env.TEST_MONGO_URI;
  if (!mongoUri) {
    throw new Error('Thiếu TEST_MONGO_URI cho integration test; không fallback MONGO_URI.');
  }
  return assertSafeTestMongoUri(mongoUri);
}

module.exports = {
  getDatabaseName,
  isSafeTestMongoUri,
  assertSafeTestMongoUri,
  resolveTestMongoUri
};
