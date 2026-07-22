const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  validateEnvironment,
  validateSecretFiles
} = require('../../../ops/scripts/preflight');

function validEnvironment() {
  const secret = 'a'.repeat(48);
  return {
    NODE_ENV: 'production',
    DEPLOY_ENV: 'staging',
    MONGO_INITDB_ROOT_USERNAME: 'staging_root',
    MONGO_INITDB_ROOT_PASSWORD: secret,
    MONGO_URI: `mongodb://staging_root:${secret}@mongo:27017/indoor_nav_staging?authSource=admin&replicaSet=rs0`,
    REDIS_PASSWORD: secret,
    REDIS_URL: `redis://:${secret}@redis:6379/0`,
    MINIO_ROOT_USER: 'staging-access-key-123456',
    MINIO_ROOT_PASSWORD: secret,
    MINIO_ACCESS_KEY: 'staging-access-key-123456',
    MINIO_SECRET_KEY: secret,
    JWT_SECRET: secret,
    PAYMENT_TOKEN_SECRET: secret,
    OAUTH_STATE_SECRET: secret,
    IDENTITY_CHALLENGE_SECRET: secret,
    METRICS_TOKEN: secret,
    MOCK_PAYMENT_ENABLED: 'false',
    MINIO_PUBLIC_READ: 'false'
  };
}

describe('operations staging preflight', () => {
  test('accepts an isolated staging configuration', () => {
    expect(validateEnvironment(validEnvironment())).toEqual([]);
  });

  test('fails closed on placeholder, development DB and public MinIO', () => {
    const env = validEnvironment();
    env.JWT_SECRET = '<replace-me>';
    env.MONGO_URI = 'mongodb://mongo:27017/development?replicaSet=rs0';
    env.MINIO_PUBLIC_READ = 'true';
    expect(validateEnvironment(env)).toEqual(expect.arrayContaining([
      expect.stringContaining('JWT_SECRET'),
      expect.stringContaining('staging'),
      expect.stringContaining('MINIO_PUBLIC_READ')
    ]));
  });

  test('requires matching secret files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preflight-test-'));
    const secrets = path.join(root, 'ops', 'secrets');
    fs.mkdirSync(secrets, { recursive: true });
    fs.writeFileSync(path.join(secrets, 'mongo-keyfile'), 'A'.repeat(800));
    fs.writeFileSync(path.join(secrets, 'metrics-token'), 'wrong');
    expect(validateSecretFiles(root, validEnvironment())).toContain(
      'metrics-token file must match METRICS_TOKEN'
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
