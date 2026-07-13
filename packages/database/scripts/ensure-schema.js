const { Client } = require('pg');

const { getDatabaseConfig } = require('../src/config');

async function ensureSchema() {
  const databaseConfig = getDatabaseConfig();
  const schemaName = databaseConfig.searchPath[0];

  const client = new Client(databaseConfig.connection);

  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
  await client.end();

  console.log(`Schema ensured: ${schemaName}`);
}

ensureSchema().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
