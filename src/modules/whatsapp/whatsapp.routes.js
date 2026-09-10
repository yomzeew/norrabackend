const express = require('express');
const controller = require('./whatsapp.controller');

const router = express.Router();

router.post('/connect', controller.connect);

module.exports = router;
