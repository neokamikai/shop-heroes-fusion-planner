const { getDatabaseConfig } = require('./src/config');

module.exports = {
  development: getDatabaseConfig(),
  staging: getDatabaseConfig(),
  production: getDatabaseConfig()
};

