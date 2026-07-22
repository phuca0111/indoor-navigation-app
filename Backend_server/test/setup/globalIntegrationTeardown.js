require('dotenv').config();

const mongoose = require('mongoose');
const { resolveTestMongoUri } = require('../support/testDatabase');

module.exports = async function globalIntegrationTeardown() {
  const uri = resolveTestMongoUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
