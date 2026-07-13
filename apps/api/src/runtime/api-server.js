const http = require('http');
const { WebSocketServer } = require('ws');

const { destroyDatabaseClient } = require('@shop-heroes-planner/database');

const { app } = require('../app');
const { createAssistantWebSocketRuntime } = require('./assistant-websocket-runtime');

function createApiServer() {
  const httpServer = http.createServer(app);
  const assistantWebSocketRuntime = createAssistantWebSocketRuntime({
    httpServer,
    WebSocketServer
  });

  let shutdownPromise;

  function listen(port, callback) {
    return httpServer.listen(port, callback);
  }

  async function shutdown() {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = new Promise((resolve, reject) => {
      assistantWebSocketRuntime.shutdown().catch(reject);

      httpServer.close(async (error) => {
        try {
          await destroyDatabaseClient();
        } catch (destroyError) {
          reject(destroyError);
          return;
        }

        if (error) {
          reject(error);
          return;
        }

        resolve();
      });

      if (typeof httpServer.closeIdleConnections === 'function') {
        httpServer.closeIdleConnections();
      }

      if (typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
    });

    return shutdownPromise;
  }

  return {
    httpServer,
    listen,
    shutdown
  };
}

module.exports = {
  createApiServer
};
