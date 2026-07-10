const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { auth, adminAuth } = require('../middleware/auth');
const { Product } = require('../models');
const { uploadProducts } = require('../config/upload');

router.get('/', productController.getProducts);
router.get('/featured', productController.getFeaturedProducts);
router.get('/bestsellers', productController.getBestsellers);
router.get('/clearance', productController.getClearanceProducts);
router.get('/category/:categoryId', productController.getProductsByCategory);
router.get('/:id', productController.getProductById);
router.post('/upload-product-images', uploadProducts, productController.uploadProductImages);
router.post('/', adminAuth, uploadProducts, productController.createProduct);
router.put('/:id', adminAuth, uploadProducts, productController.updateProduct);
router.delete('/:id', adminAuth, productController.deleteProduct);

router.post('/refresh-images', adminAuth, async (req, res) => {
  if (process.env.ALLOW_SAMPLE_IMAGE_REFRESH !== 'true') {
    return res.status(403).json({ message: 'Sample image refresh is disabled. Manage product images from admin.' });
  }
  const { importExistingImages, assignCategoryImages } = require('../utils/importImages');
  const result = await importExistingImages();
  const categoryResult = await assignCategoryImages();
  res.json({
    message: 'Images refreshed from local Wildzoc assets',
    productsUpdated: result?.productsUpdated || 0,
    imagesCopied: result?.imagesCopied || 0,
    categoriesUpdated: categoryResult || 0
  });
});

router.post('/reseed', adminAuth, async (req, res) => {
  const { Product, Category } = require('../models');
  await Product.destroy({ where: {}, truncate: true });
  await Category.destroy({ where: {}, truncate: true, force: true });
  res.json({ message: 'Products and categories cleared' });
});

module.exports = router;
