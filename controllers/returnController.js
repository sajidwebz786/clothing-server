const { Return, Order, OrderItem, User } = require('../models');

exports.createReturn = async (req, res) => {
  try {
    const { order_id, order_item_id, reason } = req.body;
    const order = await Order.findByPk(order_id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const orderItem = await OrderItem.findByPk(order_item_id);
    if (!orderItem) return res.status(404).json({ message: 'Order item not found' });
    const returnRequest = await Return.create({
      order_id,
      order_item_id,
      user_id: req.user.id,
      reason,
      refund_amount: orderItem.price
    });
    res.status(201).json(returnRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReturns = async (req, res) => {
  try {
    const returns = await Return.findAll({
      where: { user_id: req.user.id },
      include: [
        { model: Order, as: 'order', include: [{ model: OrderItem, as: 'items' }] }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReturnById = async (req, res) => {
  try {
    const returnRequest = await Return.findByPk(req.params.id, {
      include: [
        { model: Order, as: 'order' },
        { model: OrderItem, as: 'orderItem' }
      ]
    });
    res.json(returnRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllReturns = async (req, res) => {
  try {
    const returns = await Return.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: Order, as: 'order' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(returns);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateReturnStatus = async (req, res) => {
  try {
    const { status, refund_amount } = req.body;
    await Return.update({ status, refund_amount }, { where: { id: req.params.id } });
    const returnRequest = await Return.findByPk(req.params.id);
    res.json(returnRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};