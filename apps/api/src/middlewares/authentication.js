const { ApiError } = require('../errors/api-error');
const { readBearerToken } = require('../utils/auth');

function createAuthenticationMiddleware(authService) {
  return async function authenticateRequest(request, response, next) {
    try {
      const accessToken = readBearerToken(request.headers.authorization || '');

      if (!accessToken) {
        request.auth = {
          accessToken: null,
          user: null
        };
        next();
        return;
      }

      const authContext = await authService.authenticateToken(accessToken);

      if (!authContext) {
        request.auth = {
          accessToken: null,
          user: null
        };
        next();
        return;
      }

      request.auth = {
        accessToken,
        user: authContext.user
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}

function requireAuthenticatedUser(request, _response, next) {
  if (!request.auth?.user) {
    next(new ApiError(401, 'Authentication is required.', 'authentication_required'));
    return;
  }

  next();
}

module.exports = {
  createAuthenticationMiddleware,
  requireAuthenticatedUser
};
