const express = require('express');
const router = express.Router();
const returnController = require('../controllers/returnController');
const { auth, adminAuth } = require('../middleware/auth');

router.get('/', auth, returnController.getReturns);
router.get('/all', adminAuth, returnController.getAllReturns);
router.get('/:id', auth, returnController.getReturnById);
router.post('/', auth, returnController.createReturn);
router.put('/:id/status', adminAuth, returnController.updateReturnStatus);

module.exports = router;