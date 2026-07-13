const express = require('express');

const { getDatabaseClient, getDatabaseConfig } = require('@shop-heroes-planner/database');

const healthRouter = express.Router();

healthRouter.get('/', async (_request, response, next) => {
  try {
    const databaseConfig = getDatabaseConfig();
    const database = getDatabaseClient();
    const databasePing = await database.raw('SELECT 1 as ok');

    response.json({
      status: 'ok',
      service: 'api',
      database: {
        host: databaseConfig.connection.host,
        port: databaseConfig.connection.port,
        database: databaseConfig.connection.database,
        schema: databaseConfig.searchPath,
        connected: Array.isArray(databasePing?.rows) ? databasePing.rows[0]?.ok === 1 : true
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  healthRouter
};
