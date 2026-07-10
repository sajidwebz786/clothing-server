const { Wishlist, Product } = require('../models');

exports.getWishlist = async (req, res) => {
  try {
    const wishlistItems = await Wishlist.findAll({
      where: { user_id: req.user.id },
      include: [{ model: Product, as: 'product' }]
    });
    res.json(wishlistItems);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addToWishlist = async (req, res) => {
  try {
    const { product_id } = req.body;
    const existing = await Wishlist.findOne({
      where: { user_id: req.user.id, product_id }
    });
    if (existing) return res.status(400).json({ message: 'Product already in wishlist' });
    const wishlistItem = await Wishlist.create({
      user_id: req.user.id,
      product_id
    });
    res.status(201).json(wishlistItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.removeFromWishlist = async (req, res) => {
  try {
    await Wishlist.destroy({ where: { product_id: req.params.productId, user_id: req.user.id } });
    res.json({ message: 'Removed from wishlist' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.checkWishlist = async (req, res) => {
  try {
    const item = await Wishlist.findOne({
      where: { user_id: req.user.id, product_id: req.params.productId }
    });
    res.json({ isInWishlist: !!item });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};