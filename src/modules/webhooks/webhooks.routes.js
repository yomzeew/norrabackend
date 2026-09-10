const express = require('express');
const { requireValidSignature } = require('./signature');
const controller = require('./webhooks.controller');

const router = express.Router();

router.get('/whatsapp', controller.verify);
router.post('/whatsapp', requireValidSignature, controller.receive);

module.exports = router;
