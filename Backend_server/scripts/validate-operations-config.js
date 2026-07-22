'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '../..');
const files = [
  'docker-compose.yml',
  'prometheus.yml',
  'ops/observability/alerts.yml',
  'ops/observability/alertmanager.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/security.yml',
  '.github/workflows/production-deploy.yml'
];

function parse(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) {
    throw new Error(`${relative}: ${document.errors.map((error) => error.message).join('; ')}`);
  }
  return document.toJS();
}

function validate() {
  const parsed = Object.fromEntries(files.map((file) => [file, parse(file)]));
  const compose = parsed['docker-compose.yml'];
  if (!compose.services?.api || !compose.services?.mongo || !compose.networks?.backend?.internal) {
    throw new Error('Compose must define API, Mongo and an internal backend network.');
  }
  const prometheus = parsed['prometheus.yml'];
  if (!prometheus.rule_files?.length || !prometheus.alerting?.alertmanagers?.length) {
    throw new Error('Prometheus rules and Alertmanager targets are required.');
  }
  const alerts = parsed['ops/observability/alerts.yml'];
  if (!alerts.groups?.some((group) => group.rules?.length >= 8)) {
    throw new Error('Operational alert coverage is incomplete.');
  }
  return files.length;
}

if (require.main === module) {
  try {
    console.log(`Operations YAML validation passed (${validate()} files).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { validate };
