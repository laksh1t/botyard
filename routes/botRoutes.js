const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');

router.post('/deploy', botController.deploy);
router.post('/:action', botController.action);

module.exports = router;
