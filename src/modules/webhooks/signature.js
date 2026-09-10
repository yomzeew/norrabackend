const crypto = require('crypto');
const env = require('../../config/env');
const logger = require('../../lib/logger');

// Meta signs every webhook POST with your App Secret. Without this check,
// anyone who learns your callback URL can inject fake inbound messages and
// make your AI reply to arbitrary numbers on your customers' behalf.
//
// Requires the RAW body - see app.js, where express.json is configured with a
// `verify` hook that stashes it on req.rawBody.
function verifySignature(req) {
  const header = req.get('x-hub-signature-256');
  if (!header || !req.rawBody) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.META_APP_SECRET).update(req.rawBody).digest('hex');

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

function requireValidSignature(req, res, next) {
  if (!verifySignature(req)) {
    logger.warn({ path: req.path, ip: req.ip }, 'Rejected webhook with invalid signature');
    return res.sendStatus(403);
  }
  return next();
}

module.exports = { verifySignature, requireValidSignature };
