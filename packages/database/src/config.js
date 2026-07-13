const path = require('path');

const { readRequiredEnv } = require('./env');

function getDatabaseConfig() {
  const schema = readRequiredEnv('DB_SCHEMA', 'shop_heroes_planner');

  return {
    client: 'pg',
    connection: {
      host: readRequiredEnv('DB_HOST', '127.0.0.1'),
      port: Number(readRequiredEnv('DB_PORT', '5432')),
      database: readRequiredEnv('DB_NAME', 'shop_heroes_fusion_planner'),
      user: readRequiredEnv('DB_USER', 'postgres'),
      password: readRequiredEnv('DB_PASSWORD', 'postgres')
    },
    searchPath: [schema],
    migrations: {
      directory: path.resolve(__dirname, '../migrations'),
      tableName: 'knex_migrations',
      schemaName: schema
    },
    seeds: {
      directory: path.resolve(__dirname, '../seeds')
    },
    pool: {
      min: 0,
      max: 10
    }
  };
}

module.exports = {
  getDatabaseConfig
};

