require('dotenv').config();

const mongoose = require('mongoose');
const { assertSafeTestMongoUri } = require('../support/testDatabase');
const globalIntegrationSetup = require('./globalIntegrationSetup');

module.exports = async function globalReplicaIntegrationSetup() {
  let uri = process.env.TEST_MONGO_REPLICA_URI;
  if (!uri) {
    const { MongoMemoryReplSet } = require('mongodb-memory-server');
    const replica = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' }
    });
    global.__TARGET_ARCHITECTURE_REPLICA__ = replica;
    uri = replica.getUri('target_architecture_test_transactions');
  }
  uri = assertSafeTestMongoUri(uri);
  process.env.TEST_MONGO_REPLICA_URI = uri;
  process.env.TEST_MONGO_URI = uri;
  process.env.MONGO_URI = uri;

  await mongoose.connect(uri);
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName || !hello.logicalSessionTimeoutMinutes) {
      throw new Error(
        'Transaction integration test yêu cầu TEST_MONGO_REPLICA_URI trỏ tới MongoDB replica set.'
      );
    }
  } finally {
    await mongoose.disconnect();
  }

  await globalIntegrationSetup();
};
