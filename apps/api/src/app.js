const cors = require('cors');
const express = require('express');

const { accountsRouter } = require('./routes/accounts.routes');
const { assistantRouter } = require('./routes/assistant.routes');
const { authRouter } = require('./routes/auth.routes');
const { env } = require('./config/env');
const { createAuthService } = require('./containers/auth.container');
const { errorHandler } = require('./middlewares/error-handler');
const { createAuthenticationMiddleware } = require('./middlewares/authentication');
const { catalogRouter } = require('./routes/catalog.routes');
const { healthRouter } = require('./routes/health.routes');

const app = express();
const authService = createAuthService();
const allowedOrigins = new Set([
  env.webOrigin,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    }
  })
);
app.use(express.json());
app.use(createAuthenticationMiddleware(authService));

app.get('/', (_request, response) => {
  response.json({
    name: 'shop-heroes-fusion-planner-api',
    status: 'ok'
  });
});

app.use('/health', healthRouter);
app.use('/catalog', catalogRouter);
app.use('/auth', authRouter);
app.use('/accounts', accountsRouter);
app.use('/assistant', assistantRouter);
app.use(errorHandler);

module.exports = {
  app
};
