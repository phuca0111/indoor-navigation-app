require('dotenv').config();

const { resolveTestMongoUri } = require('../support/testDatabase');

const testMongoUri = resolveTestMongoUri();
process.env.TEST_MONGO_URI = testMongoUri;
// Các integration test legacy vẫn đọc MONGO_URI; chỉ ghi đè sau khi URI đã qua guard.
process.env.MONGO_URI = testMongoUri;
process.env.NODE_ENV = 'test';
