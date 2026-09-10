const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const pinoHttp = require('pino-http');
const crypto = require('crypto');

const logger = require('./lib/logger');
const healthRoutes = require('./modules/health/health.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const webhookRoutes = require('./modules/webhooks/webhooks.routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  // Behind a load balancer / ingress, so req.ip and protocol come from headers.
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(cors());

  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.get('x-request-id') || crypto.randomUUID(),
      autoLogging: { ignore: (req) => req.url === '/healthz' },
    })
  );

  // Keep the raw body so webhook HMAC verification can run over the exact
  // bytes Meta signed. JSON.stringify(req.body) would not round-trip reliably.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(healthRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/webhooks', webhookRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
