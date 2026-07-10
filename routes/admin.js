const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminAuth } = require('../middleware/auth');

router.get('/dashboard', adminAuth, adminController.getDashboardStats);
router.get('/users', adminAuth, adminController.getAllUsers);
router.get('/products', adminAuth, adminController.getAllProducts);
router.get('/categories', adminAuth, adminController.getAllCategories);
router.get('/cloudinary/images', adminAuth, adminController.getCloudinaryImages);
router.get('/cloudinary-images', adminAuth, adminController.getCloudinaryImages);

module.exports = router;
