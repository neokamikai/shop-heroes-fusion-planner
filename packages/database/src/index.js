const { createDatabaseClient, destroyDatabaseClient, getDatabaseClient } = require('./client');
const { getDatabaseConfig } = require('./config');
const { getSchemaName, withSchema } = require('./schema');

module.exports = {
  createDatabaseClient,
  destroyDatabaseClient,
  getDatabaseConfig,
  getDatabaseClient,
  getSchemaName,
  withSchema
};
