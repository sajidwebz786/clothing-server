const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const { auth, adminAuth } = require('../middleware/auth');

router.get('/', auth, orderController.getOrders);
router.get('/track/:tracking', orderController.trackOrder);
router.get('/:id', auth, orderController.getOrderById);
router.post('/', auth, orderController.createOrder);
router.put('/:id/status', adminAuth, orderController.updateOrderStatus);
router.get('/admin/all', adminAuth, orderController.getAllOrders);

module.exports = router;