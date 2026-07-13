const knex = require('knex');

const { getDatabaseConfig } = require('./config');

let databaseClient;

function createDatabaseClient() {
  return knex(getDatabaseConfig());
}

function getDatabaseClient() {
  if (!databaseClient) {
    databaseClient = createDatabaseClient();
  }

  return databaseClient;
}

async function destroyDatabaseClient() {
  if (!databaseClient) return;

  await databaseClient.destroy();
  databaseClient = undefined;
}

module.exports = {
  createDatabaseClient,
  destroyDatabaseClient,
  getDatabaseClient
};

