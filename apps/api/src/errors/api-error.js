class ApiError extends Error {
  constructor(statusCode, message, code = 'api_error') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = {
  ApiError
};

