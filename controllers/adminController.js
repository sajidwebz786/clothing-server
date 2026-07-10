const { User, Product, Order, OrderItem, Category, Return } = require('../models');
const { sequelize } = require('../models');
const { v2: cloudinary } = require('cloudinary');

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
}

const isBrandAsset = (resource) => {
  const text = `${resource.public_id || ''} ${resource.filename || ''} ${resource.secure_url || ''}`.toLowerCase();
  return ['logo', 'qr', 'hypzo', 'oldlogo', 'dark-logo', 'full-logo'].some((word) => text.includes(word));
};

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

exports.getCloudinaryImages = async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_URL) {
      return res.status(400).json({ message: 'Cloudinary is not configured on the server.' });
    }

    const folder = req.query.folder || process.env.CLOUDINARY_GALLERY_FOLDER || '';
    const resources = [];
    let nextCursor;

    do {
      const result = await cloudinary.api.resources({
        resource_type: 'image',
        type: 'upload',
        prefix: folder || undefined,
        max_results: 100,
        next_cursor: nextCursor
      });
      resources.push(...(result.resources || []));
      nextCursor = result.next_cursor;
    } while (nextCursor && resources.length < 300);

    const images = resources
      .filter((resource) => resource.secure_url && !isBrandAsset(resource))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((resource) => ({
        public_id: resource.public_id,
        url: resource.secure_url,
        width: resource.width,
        height: resource.height,
        created_at: resource.created_at
      }));

    res.json({ images });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
