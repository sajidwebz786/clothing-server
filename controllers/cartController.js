const { Cart, Product } = require('../models');

exports.getCart = async (req, res) => {
  try {
    console.log('getCart for user:', req.user.id);
    const cartItems = await Cart.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']]
    });
    
    console.log('Found cart items:', cartItems.length);
    
    const itemsWithProducts = await Promise.all(cartItems.map(async (item) => {
      const product = await Product.findByPk(item.product_id);
      const itemData = item.toJSON();
      return { 
        ...itemData, 
        product: product ? {
          id: product.id,
          name: product.name,
          price: product.price,
          images: product.images
        } : null
      };
    }));
    
    let total = 0;
    for (const item of itemsWithProducts) {
      if (item.product) {
        total += parseFloat(item.product.price) * item.quantity;
      }
    }
    console.log('Cart total:', total);
    res.json({ items: itemsWithProducts, total });
  } catch (error) {
    console.error('getCart error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.addToCart = async (req, res) => {
  try {
    const { product_id, quantity, size, color } = req.body;
    console.log('addToCart:', product_id, req.user.id, quantity, size, color);
    
    // Check if product exists first
    const product = await Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    
    const whereClause = { user_id: req.user.id, product_id };
    if (size) whereClause.size = size;
    if (color) whereClause.color = color;
    
    const existingItem = await Cart.findOne({ where: whereClause });
    if (existingItem) {
      const newQty = existingItem.quantity + (quantity || 1);
      await existingItem.update({ quantity: newQty });
      console.log('Updated existing cart item, new quantity:', newQty);
      return res.json(existingItem);
    }
    const cartItem = await Cart.create({
      user_id: req.user.id,
      product_id,
      quantity: quantity || 1,
      size: size || null,
      color: color || null
    });
    console.log('Created new cart item:', cartItem.id);
    res.status(201).json(cartItem);
  } catch (error) {
    console.error('addToCart error:', error);
    res.status(500).json({ message: error.message, stack: error.stack });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    await Cart.update({ quantity }, { where: { id: req.params.id, user_id: req.user.id } });
    const cartItem = await Cart.findByPk(req.params.id);
    res.json(cartItem);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.removeCartItem = async (req, res) => {
  try {
    await Cart.destroy({ where: { id: req.params.id, user_id: req.user.id } });
    res.json({ message: 'Item removed from cart' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    await Cart.destroy({ where: { user_id: req.user.id } });
    res.json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};