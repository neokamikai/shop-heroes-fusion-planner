const { readRequiredEnv } = require('./env');

function getSchemaName() {
  return readRequiredEnv('DB_SCHEMA', 'shop_heroes_planner');
}

function withSchema(tableName) {
  return `${getSchemaName()}.${tableName}`;
}

module.exports = {
  getSchemaName,
  withSchema
};

