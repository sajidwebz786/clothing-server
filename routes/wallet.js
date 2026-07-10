const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { auth, adminAuth } = require('../middleware/auth');

router.get('/', auth, walletController.getWallet);
router.post('/add', auth, walletController.addToWallet);
router.post('/deduct', auth, walletController.deductFromWallet);
router.post('/admin-add', adminAuth, walletController.adminAddToWallet);

module.exports = router;