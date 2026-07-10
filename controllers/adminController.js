const { User, Product, Order, OrderItem, Category, Return } = require('../models');
const { sequelize } = require('../models');

exports.getDashboardStats = async (req, res) => {
  try {
    const totalUsers = await User.count({ where: { role: 'user' } });
    const totalProducts = await Product.count({ where: { is_active: true } });
    const totalOrders = await Order.count();
    const revenueResult = await sequelize.query(
      "SELECT COALESCE(SUM(total), 0) as total FROM orders WHERE payment_status = 'paid'",
      { type: sequelize.QueryTypes.SELECT }
    );
    const revenue = revenueResult[0]?.total || 0;
    const lowStock = await Product.findAll({
      where: { is_active: true, stock: { [sequelize.Op.lte]: 5 } },
      attributes: ['id', 'name', 'stock'],
      limit: 10
    });
    const recentOrders = await Order.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });
    const pendingReturns = await Return.count({ where: { status: 'pending' } });
    res.json({
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        revenue,
        pendingReturns
      },
      lowStock,
      recentOrders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { role: 'user' },
      attributes: ['id', 'name', 'email', 'phone', 'wallet_balance', 'is_verified', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }],
      order: [['createdAt', 'DESC']]
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};