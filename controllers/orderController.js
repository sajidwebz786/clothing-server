const { Order, OrderItem, Product, User, Address, Cart } = require('../models');
const { v4: uuidv4 } = require('uuid');
const { notifyAdmin, sendMail } = require('../utils/mailer');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const orderPrice = (price) => Number(price || 0);

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured on the server');
  }
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
};

const getCartTotal = async (userId, transaction) => {
  const cartItems = await Cart.findAll({
    where: { user_id: userId },
    include: [{ model: Product, as: 'product' }],
    transaction
  });
  if (!cartItems.length) throw new Error('Cart is empty');

  let subtotal = 0;
  for (const item of cartItems) {
    if (!item.product || !item.product.is_active) throw new Error('A product in your cart is no longer available');
    if (item.quantity > item.product.stock) throw new Error(`${item.product.name} does not have enough stock`);
    subtotal += orderPrice(item.product.price) * item.quantity;
  }
  return { cartItems, subtotal, shipping: 0, total: subtotal };
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { address_id } = req.body;
    const userId = req.user.id;
    const address = await Address.findOne({ where: { id: address_id, user_id: userId } });
    if (!address) return res.status(400).json({ message: 'Address not found' });
    const { total } = await getCartTotal(userId);
    const amount = Math.round(total * 100);
    if (amount < 100) return res.status(400).json({ message: 'Order total must be at least ₹1' });

    const razorpayOrder = await getRazorpay().orders.create({
      amount,
      currency: 'INR',
      receipt: `wz_${Date.now()}_${String(userId).slice(0, 8)}`,
      notes: { user_id: String(userId), address_id: String(address_id) }
    });

    res.json({
      key_id: process.env.RAZORPAY_KEY_ID,
      razorpay_order_id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: 'Wildzoc',
      customer: { name: req.user.name, email: req.user.email, phone: req.user.phone }
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { address_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!address_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ message: 'Incomplete Razorpay payment details' });
    }

    const existing = await Order.findOne({ where: { payment_id: razorpay_payment_id } });
    if (existing) {
      if (existing.user_id !== req.user.id) return res.status(409).json({ message: 'Payment is already linked to an order' });
      return res.json(existing);
    }

    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    const validSignature = expected.length === razorpay_signature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpay_signature));
    if (!validSignature) return res.status(400).json({ message: 'Payment verification failed' });

    const address = await Address.findOne({ where: { id: address_id, user_id: req.user.id } });
    if (!address) return res.status(400).json({ message: 'Address not found' });

    const razorpay = getRazorpay();
    let payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.order_id !== razorpay_order_id || payment.currency !== 'INR') {
      return res.status(400).json({ message: 'Payment does not match this order' });
    }
    if (payment.status === 'authorized') {
      payment = await razorpay.payments.capture(razorpay_payment_id, payment.amount, 'INR');
    }
    if (payment.status !== 'captured') return res.status(400).json({ message: 'Payment has not been captured' });

    const result = await Order.sequelize.transaction(async (transaction) => {
      const duplicate = await Order.findOne({ where: { payment_id: razorpay_payment_id }, transaction });
      if (duplicate) return duplicate;
      const { cartItems, subtotal, shipping, total } = await getCartTotal(req.user.id, transaction);
      if (payment.amount !== Math.round(total * 100)) throw new Error('Cart total changed after payment started. Please contact support.');

      const order = await Order.create({
        user_id: req.user.id,
        order_number: 'WZ' + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase(),
        address_id,
        subtotal,
        shipping_charge: shipping,
        total,
        payment_method: 'razorpay',
        payment_id: razorpay_payment_id,
        razorpay_order_id,
        payment_status: 'paid',
        order_status: 'confirmed',
        tracking_number: 'WZ' + uuidv4().split('-')[0].toUpperCase()
      }, { transaction });

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
        }, { transaction });
        await Product.decrement('stock', { by: item.quantity, where: { id: item.product_id }, transaction });
      }
      await Cart.destroy({ where: { user_id: req.user.id }, transaction });
      return order;
    });

    notifyAdmin(
      `Paid Wildzoc order ${result.order_number}`,
      `${req.user.name || 'Customer'} paid ₹${result.total} via Razorpay. Payment ID: ${razorpay_payment_id}.`
    ).catch(() => {});
    if (req.user.email) {
      sendMail({
        to: req.user.email,
        subject: `Wildzoc payment confirmed: ${result.order_number}`,
        text: `Your payment is confirmed and order ${result.order_number} is being prepared. Tracking: ${result.tracking_number}.`
      }).catch(() => {});
    }
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.razorpayWebhook = async (req, res) => {
  try {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) return res.status(503).json({ message: 'Webhook is not configured' });
    const signature = req.header('x-razorpay-signature') || '';
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(req.rawBody || '').digest('hex');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }
    const payment = req.body?.payload?.payment?.entity;
    if (payment?.id && req.body.event === 'payment.captured') {
      await Order.update({ payment_status: 'paid' }, { where: { payment_id: payment.id } });
    } else if (payment?.id && req.body.event === 'payment.failed') {
      await Order.update({ payment_status: 'failed' }, { where: { payment_id: payment.id } });
    }
    res.json({ received: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
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
    const { order_status, tracking_number, courier_name, dispatch_message, admin_note } = req.body;
    await Order.update(
      { order_status, tracking_number, courier_name, dispatch_message, admin_note },
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
    notifyAdmin(
      `Order ${order.order_number} updated to ${order.order_status}`,
      `Payment: ${order.payment_status}. Courier: ${order.courier_name || 'pending'}. Tracking: ${order.tracking_number || 'pending'}. Customer: ${order.user?.name || 'Unknown'} (${order.user?.email || 'no email'}).`
    ).catch(() => {});
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
