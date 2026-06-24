const express = require('express');
const router = express.Router();
const botController = require('../controllers/botController');
const authMiddleware = require('../middlewares/authMiddleware');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

router.post('/deploy', authMiddleware, upload.single('sourceFile'), botController.deploy);
router.post('/:action', authMiddleware, botController.action);
router.get('/', authMiddleware, botController.getBots);

module.exports = router;
