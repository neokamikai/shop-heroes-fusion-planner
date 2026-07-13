const express = require('express');

const { createAuthService } = require('../containers/auth.container');
const { requireAuthenticatedUser } = require('../middlewares/authentication');

const authRouter = express.Router();
const authService = createAuthService();

authRouter.post('/sign-up', async (request, response, next) => {
  try {
    const result = await authService.signUp(request.body);

    response.status(201).json({
      accessToken: result.accessToken,
      emailVerificationRequired: !result.user.emailVerified,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/sign-in', async (request, response, next) => {
  try {
    const result = await authService.signIn(request.body);

    response.json({
      accessToken: result.accessToken,
      emailVerificationRequired: !result.user.emailVerified,
      user: result.user
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/sign-out', async (request, response, next) => {
  try {
    await authService.signOut();
    response.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.post('/verify-email', async (request, response, next) => {
  try {
    const result = await authService.verifyEmail(request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/verify-email-code', requireAuthenticatedUser, async (request, response, next) => {
  try {
    const result = await authService.verifyEmailCode(request.auth.user.id, request.body);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.post('/resend-verification', requireAuthenticatedUser, async (request, response, next) => {
  try {
    const result = await authService.resendVerificationEmail(request.auth.user.id);
    response.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', requireAuthenticatedUser, async (request, response) => {
  response.json({
    user: request.auth.user
  });
});

module.exports = {
  authRouter
};
