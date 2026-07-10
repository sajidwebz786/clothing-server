const { User } = require('../models');
const { generateToken } = require('../middleware/auth');
const { notifyAdmin, sendMail } = require('../utils/mailer');

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    const user = await User.create({ name, email, password, phone });
    const token = generateToken(user.id);
    notifyAdmin(
      'New Wildzoc registration',
      `${user.name} registered with ${user.email}${user.phone ? ` / ${user.phone}` : ''}.`
    ).catch(() => {});
    sendMail({
      to: user.email,
      subject: 'Welcome to Wildzoc',
      text: `Hi ${user.name}, your Wildzoc account is ready.`
    }).catch(() => {});
    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    const token = generateToken(user.id);
    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        wallet_balance: user.wallet_balance
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'phone', 'role', 'wallet_balance', 'is_verified', 'createdAt']
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body;
    await User.update({ name, phone }, { where: { id: req.user.id } });
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'name', 'email', 'phone', 'role', 'wallet_balance']
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
