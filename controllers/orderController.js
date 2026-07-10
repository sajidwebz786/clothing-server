const { Order, OrderItem, Product, User, Address, Cart } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { notifyAdmin, sendMail } = require('../utils/mailer');

const orderPrice = (price) => Number(price || 0);

exports.createOrder = async (req, res) => {
  try {
    const { address_id, payment_method = 'upi', payment_id } = req.body;
    const userId = req.user.id;
    const cartItems = await Cart.findAll({ where: { user_id: userId }, include: [{ model: Product, as: 'product' }] });
    if (!cartItems.length) return res.status(400).json({ message: 'Cart is empty' });
    const address = await Address.findByPk(address_id);
    if (!address) return res.status(400).json({ message: 'Address not found' });
    let subtotal = 0;
    for (const item of cartItems) {
      subtotal += orderPrice(item.product.price) * item.quantity;
    }
    const shipping = 0;
    const total = subtotal + shipping;
    const orderNumber = 'WZ' + Date.now() + Math.random().toString(36).substr(2, 4).toUpperCase();
    const trackingNumber = 'WZ' + uuidv4().split('-')[0].toUpperCase();
    const order = await Order.create({
      user_id: userId,
      order_number: orderNumber,
      address_id,
      subtotal,
      shipping_charge: shipping,
      total,
      payment_method: payment_method === 'upi' ? 'upi' : 'upi',
      payment_id,
      payment_status: 'pending',
      order_status: 'pending',
      tracking_number: trackingNumber
    });
    for (const item of cartItems) {
      await OrderItem.create({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product.name,
        product_image: item.product.images?.[0],
        quantity: item.quantity,
        price: orderPrice(item.product.price),
        size: item.size,
        color: item.color
      });
      await Product.decrement('stock', { by: item.quantity, where: { id: item.product_id } });
    }
    await Cart.destroy({ where: { user_id: userId } });
    const user = await User.findByPk(userId);
    notifyAdmin(
      `New Wildzoc order ${order.order_number}`,
      `${user?.name || 'Customer'} placed order ${order.order_number} for ₹${total}. UTR: ${payment_id || 'not provided'}.`
    ).catch(() => {});
    if (user?.email) {
      sendMail({
        to: user.email,
        subject: `Wildzoc order received: ${order.order_number}`,
        text: `We received your order. UTR: ${payment_id || 'not provided'}. Admin will verify the payment and send dispatch details.`
      }).catch(() => {});
    }
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      where: { user_id: req.user.id },
      include: [{ model: OrderItem, as: 'items' }],
      order: [['createdAt', 'DESC']]
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [
        { model: OrderItem, as: 'items' },
        { model: Address, as: 'address' }
      ]
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.trackOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      where: { tracking_number: req.params.tracking },
      include: [{ model: OrderItem, as: 'items' }]
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone'] },
        { model: OrderItem, as: 'items' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { order_status, payment_status, tracking_number, courier_name, dispatch_message, admin_note } = req.body;
    await Order.update(
      { order_status, payment_status, tracking_number, courier_name, dispatch_message, admin_note },
      { where: { id: req.params.id } }
    );
    const order = await Order.findByPk(req.params.id, { include: [{ model: User, as: 'user' }] });
    if (order?.user?.email) {
      sendMail({
        to: order.user.email,
        subject: `Wildzoc order update: ${order.order_number}`,
        text: dispatch_message || `Your order is now ${order.order_status}. Courier: ${courier_name || 'pending'}. Tracking: ${tracking_number || 'pending'}.`
      }).catch(() => {});
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
