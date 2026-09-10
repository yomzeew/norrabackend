const logger = require('../lib/logger');
const { AppError } = require('../utils/errors');

function notFound(req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isOperational = err instanceof AppError && err.isOperational;
  const status = isOperational ? err.statusCode : 500;

  logger[status >= 500 ? 'error' : 'warn'](
    { err, requestId: req.id, path: req.path },
    'Request failed'
  );

  res.status(status).json({
    error: {
      code: err.code || 'internal_error',
      // Never leak internal error text to clients on a 500.
      message: isOperational ? err.message : 'Internal server error',
    },
  });
}

module.exports = { errorHandler, notFound };
