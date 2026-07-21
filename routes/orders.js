const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { auth, adminAuth } = require('../middleware/auth');

router.get('/', auth, orderController.getOrders);
router.get('/track/:tracking', orderController.trackOrder);
router.post('/razorpay/create', auth, orderController.createRazorpayOrder);
router.post('/razorpay/verify', auth, orderController.verifyRazorpayPayment);
router.post('/razorpay/webhook', orderController.razorpayWebhook);
router.get('/admin/all', adminAuth, orderController.getAllOrders);
router.get('/:id', auth, orderController.getOrderById);
router.put('/:id/status', adminAuth, orderController.updateOrderStatus);

module.exports = router;
