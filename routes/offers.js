const express = require('express');
const router = express.Router();
const offerController = require('../controllers/offerController');
const { auth, adminAuth } = require('../middleware/auth');

router.get('/active', offerController.getActiveOffers);
router.post('/validate', offerController.validateOffer);
router.get('/', adminAuth, offerController.getOffers);
router.post('/', adminAuth, offerController.createOffer);
router.put('/:id', adminAuth, offerController.updateOffer);
router.delete('/:id', adminAuth, offerController.deleteOffer);

module.exports = router;