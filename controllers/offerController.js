const { Offer } = require('../models');
const { Op } = require('sequelize');

exports.getActiveOffers = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const offers = await Offer.findAll({
      where: {
        is_active: true,
        start_date: { [Op.lte]: today },
        end_date: { [Op.gte]: today }
      }
    });
    res.json(offers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.validateOffer = async (req, res) => {
  try {
    const { code, total } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const offer = await Offer.findOne({
      where: {
        code,
        is_active: true,
        start_date: { [Op.lte]: today },
        end_date: { [Op.gte]: today }
      }
    });
    if (!offer) return res.status(400).json({ message: 'Invalid or expired coupon' });
    if (total < parseFloat(offer.min_purchase)) {
      return res.status(400).json({ message: `Minimum purchase of ₹${offer.min_purchase} required` });
    }
    let discount = 0;
    if (offer.discount_type === 'percentage') {
      discount = (total * parseFloat(offer.discount_value)) / 100;
      if (offer.max_discount && discount > parseFloat(offer.max_discount)) {
        discount = parseFloat(offer.max_discount);
      }
    } else {
      discount = parseFloat(offer.discount_value);
    }
    res.json({ offer, discount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOffers = async (req, res) => {
  try {
    const offers = await Offer.findAll({ order: [['createdAt', 'DESC']] });
    res.json(offers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createOffer = async (req, res) => {
  try {
    const offer = await Offer.create(req.body);
    res.status(201).json(offer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateOffer = async (req, res) => {
  try {
    await Offer.update(req.body, { where: { id: req.params.id } });
    const offer = await Offer.findByPk(req.params.id);
    res.json(offer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteOffer = async (req, res) => {
  try {
    await Offer.update({ is_active: false }, { where: { id: req.params.id } });
    res.json({ message: 'Offer deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};