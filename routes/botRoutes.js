const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.post('/deploy', upload.single('sourceFile'), botController.deploy);
router.post('/:action', botController.action);

module.exports = router;
