require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { rebuildIndex } = require('../application/search/searchApplicationService');

async function main() {
  await connectDB();
  const typeArg = process.argv.find((arg) => arg.startsWith('--type='));
  const batchArg = process.argv.find((arg) => arg.startsWith('--batch-size='));
  const result = await rebuildIndex({
    type: typeArg ? typeArg.split('=')[1] : undefined,
    batchSize: batchArg ? Number(batchArg.split('=')[1]) : 100
  });
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}

module.exports = { main };
