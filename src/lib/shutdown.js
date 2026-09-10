const logger = require('./logger');

// Graceful shutdown matters more than usual here: on deploy or autoscale-down,
// an instance must finish in-flight work and release its conversation locks,
// or messages sit stuck until the lock TTL expires.
function registerShutdown({ server, workers = [], onClose = [] }) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const timeout = setTimeout(() => {
      logger.error('Graceful shutdown timed out - forcing exit');
      process.exit(1);
    }, 30000);
    timeout.unref();

    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
        logger.info('HTTP server closed');
      }

      // Worker.close() waits for active jobs to finish.
      await Promise.all(workers.map((w) => w.close()));
      if (workers.length) logger.info('Workers closed');

      for (const fn of onClose) {
        await fn();
      }

      clearTimeout(timeout);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception - exiting');
    process.exit(1);
  });
}

module.exports = { registerShutdown };
