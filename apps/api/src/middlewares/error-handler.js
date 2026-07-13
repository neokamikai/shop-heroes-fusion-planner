function errorHandler(error, _request, response, _next) {
  if ((error?.statusCode || 500) >= 500) {
    console.error(error);
  }

  response.status(error?.statusCode || 500).json({
    error: error?.code || 'internal_server_error',
    message: error?.message || 'An unexpected error happened while processing the request.'
  });
}

module.exports = {
  errorHandler
};
