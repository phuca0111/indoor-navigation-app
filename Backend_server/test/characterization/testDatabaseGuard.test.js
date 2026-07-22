const {
  getDatabaseName,
  isSafeTestMongoUri,
  assertSafeTestMongoUri,
  resolveTestMongoUri
} = require('../support/testDatabase');

describe('test database guard', () => {
  test.each([
    ['mongodb://localhost:27017/indoor_nav_test', 'indoor_nav_test'],
    ['mongodb+srv://user:pass@example.test/project_test_ci?retryWrites=true', 'project_test_ci']
  ])('chấp nhận database test rõ ràng: %s', (uri, databaseName) => {
    expect(getDatabaseName(uri)).toBe(databaseName);
    expect(isSafeTestMongoUri(uri)).toBe(true);
    expect(assertSafeTestMongoUri(uri)).toBe(uri);
  });

  test.each([
    undefined,
    'mongodb://localhost:27017',
    'mongodb://localhost:27017/HeThongBanDoTotNghiep',
    'mongodb://localhost:27017/test',
    'https://localhost/project_test'
  ])('từ chối URI không an toàn: %s', (uri) => {
    expect(isSafeTestMongoUri(uri)).toBe(false);
    expect(() => assertSafeTestMongoUri(uri)).toThrow('Từ chối chạy integration test');
  });

  test('ưu tiên TEST_MONGO_URI và vẫn kiểm tra tên database', () => {
    const uri = resolveTestMongoUri({
      TEST_MONGO_URI: 'mongodb://localhost/app_test_ci',
      MONGO_URI: 'mongodb://localhost/development'
    });
    expect(uri).toBe('mongodb://localhost/app_test_ci');
  });

  test('không fallback MONGO_URI dù database có hậu tố test', () => {
    expect(() => resolveTestMongoUri({
      MONGO_URI: 'mongodb://localhost/legacy_test'
    })).toThrow('không fallback MONGO_URI');
  });
});
