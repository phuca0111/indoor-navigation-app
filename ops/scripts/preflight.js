'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED = [
  'MONGO_INITDB_ROOT_USERNAME',
  'MONGO_INITDB_ROOT_PASSWORD',
  'MONGO_URI',
  'REDIS_PASSWORD',
  'REDIS_URL',
  'MINIO_ROOT_USER',
  'MINIO_ROOT_PASSWORD',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'JWT_SECRET',
  'PAYMENT_TOKEN_SECRET',
  'OAUTH_STATE_SECRET',
  'IDENTITY_CHALLENGE_SECRET',
  'METRICS_TOKEN'
];

const SECRET_KEYS = new Set(REQUIRED.filter((key) => (
  /PASSWORD|SECRET|TOKEN|ACCESS_KEY/.test(key)
)));
const PLACEHOLDER = /(<[^>]+>|change[-_ ]?me|example|replace|password|secret_here)/i;

function validateEnvironment(env) {
  const errors = [];
  for (const key of REQUIRED) {
    const value = String(env[key] || '').trim();
    if (!value) errors.push(`${key} is required`);
    else if (PLACEHOLDER.test(value)) errors.push(`${key} still contains a placeholder`);
    else if (SECRET_KEYS.has(key) && value.length < 24) errors.push(`${key} must be at least 24 characters`);
  }

  if (env.NODE_ENV !== 'production') errors.push('NODE_ENV must be production');
  if (env.DEPLOY_ENV !== 'staging') errors.push('DEPLOY_ENV must be staging');
  if (!/staging/i.test(String(env.MONGO_URI || ''))) {
    errors.push('MONGO_URI database name must contain staging');
  }
  if (!String(env.MONGO_URI || '').includes('replicaSet=rs0')) {
    errors.push('MONGO_URI must select replicaSet=rs0');
  }
  if (!String(env.REDIS_URL || '').includes('@redis:6379')) {
    errors.push('REDIS_URL must authenticate to the private redis service');
  }
  if (String(env.MINIO_PUBLIC_READ || 'false').toLowerCase() === 'true') {
    errors.push('MINIO_PUBLIC_READ must not be true');
  }
  if (String(env.MOCK_PAYMENT_ENABLED || 'false').toLowerCase() === 'true') {
    errors.push('MOCK_PAYMENT_ENABLED must not be true in staging');
  }
  return errors;
}

function validateSecretFiles(root, env) {
  const errors = [];
  const keyfile = path.join(root, 'ops', 'secrets', 'mongo-keyfile');
  const metricsFile = path.join(root, 'ops', 'secrets', 'metrics-token');
  if (!fs.existsSync(keyfile)) errors.push('ops/secrets/mongo-keyfile is required');
  else {
    const value = fs.readFileSync(keyfile, 'utf8').trim();
    if (value.length < 756 || PLACEHOLDER.test(value)) errors.push('Mongo keyfile must contain 756+ random characters');
  }
  if (!fs.existsSync(metricsFile)) errors.push('ops/secrets/metrics-token is required');
  else if (fs.readFileSync(metricsFile, 'utf8').trim() !== String(env.METRICS_TOKEN || '').trim()) {
    errors.push('metrics-token file must match METRICS_TOKEN');
  }
  return errors;
}

function main() {
  const errors = [
    ...validateEnvironment(process.env),
    ...validateSecretFiles(process.cwd(), process.env)
  ];
  if (errors.length) {
    console.error(`Staging preflight failed:\n- ${errors.join('\n- ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('Staging preflight passed.');
}

if (require.main === module) main();

module.exports = { REQUIRED, validateEnvironment, validateSecretFiles };
