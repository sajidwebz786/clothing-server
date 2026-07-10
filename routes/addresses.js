const express = require('express');
const router = express.Router();
const addressController = require('../controllers/addressController');
const { auth } = require('../middleware/auth');

router.get('/', auth, addressController.getAddresses);
router.post('/', auth, addressController.createAddress);
router.put('/:id', auth, addressController.updateAddress);
router.delete('/:id', auth, addressController.deleteAddress);
router.put('/:id/default', auth, addressController.setDefaultAddress);

module.exports = router;