class AppError extends Error {
  constructor(message, statusCode = 500, code = 'internal_error') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', code = 'bad_request') {
    super(message, 400, code);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found', code = 'not_found') {
    super(message, 404, code);
  }
}

class UpstreamError extends AppError {
  constructor(message = 'Upstream request failed', code = 'upstream_error') {
    super(message, 502, code);
  }
}

module.exports = { AppError, BadRequestError, NotFoundError, UpstreamError };
