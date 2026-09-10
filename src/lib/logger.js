const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'norra-backend' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'accessToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
});

module.exports = logger;
