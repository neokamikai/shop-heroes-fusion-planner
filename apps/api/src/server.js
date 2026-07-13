const { env } = require('./config/env');
const { createApiServer } = require('./runtime/api-server');

const apiServer = createApiServer();

apiServer.listen(env.apiPort, () => {
  console.log(`API listening on http://localhost:${env.apiPort}`);
});

function registerSignalHandler(signal) {
  process.on(signal, async () => {
    try {
      await apiServer.shutdown();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  });
}

registerSignalHandler('SIGINT');
registerSignalHandler('SIGTERM');
