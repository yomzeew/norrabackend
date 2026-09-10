const { PrismaClient } = require('@prisma/client');
const env = require('../config/env');
const logger = require('./logger');

// One client per process. Each horizontally scaled instance opens its own
// pool, so keep `connection_limit` low in DATABASE_URL and put PgBouncer in
// front in production - see README, "Connection limits under scale".
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

async function disconnectPrisma() {
  await prisma.$disconnect();
  logger.info('Prisma disconnected');
}

module.exports = prisma;
module.exports.disconnectPrisma = disconnectPrisma;
