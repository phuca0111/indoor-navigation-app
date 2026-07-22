require('dotenv').config();

const { assertSafeTestMongoUri } = require('../support/testDatabase');

const replicaUri = assertSafeTestMongoUri(process.env.TEST_MONGO_REPLICA_URI);
process.env.TEST_MONGO_URI = replicaUri;
process.env.MONGO_URI = replicaUri;
process.env.NODE_ENV = 'test';
process.env.BILLING_TRANSACTIONS_ENABLED = 'true';
process.env.MAP_LIFECYCLE_TRANSACTIONS_ENABLED = 'true';
process.env.IDENTITY_TRANSACTIONS_ENABLED = 'true';
process.env.CORE_TENANT_TRANSACTIONS_ENABLED = 'true';
process.env.CONTENT_TRANSACTIONS_ENABLED = 'true';
