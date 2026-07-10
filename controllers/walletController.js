const { WalletTransaction, User } = require('../models');

exports.getWallet = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['wallet_balance']
    });
    const transactions = await WalletTransaction.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 20
    });
    res.json({ balance: user.wallet_balance, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.addToWallet = async (req, res) => {
  try {
    const { amount, description } = req.body;
    const user = await User.findByPk(req.user.id);
    const newBalance = parseFloat(user.wallet_balance) + parseFloat(amount);
    await User.update({ wallet_balance: newBalance }, { where: { id: req.user.id } });
    await WalletTransaction.create({
      user_id: req.user.id,
      amount,
      type: 'credit',
      description
    });
    res.json({ balance: newBalance, message: 'Amount added to wallet' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.adminAddToWallet = async (req, res) => {
  try {
    const { user_id, amount, description } = req.body;
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const newBalance = parseFloat(user.wallet_balance) + parseFloat(amount);
    await User.update({ wallet_balance: newBalance }, { where: { id: user_id } });
    await WalletTransaction.create({
      user_id,
      amount,
      type: 'credit',
      description
    });
    res.json({ balance: newBalance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deductFromWallet = async (req, res) => {
  try {
    const { amount, description, reference_id } = req.body;
    const user = await User.findByPk(req.user.id);
    if (parseFloat(user.wallet_balance) < parseFloat(amount)) {
      return res.status(400).json({ message: 'Insufficient wallet balance' });
    }
    const newBalance = parseFloat(user.wallet_balance) - parseFloat(amount);
    await User.update({ wallet_balance: newBalance }, { where: { id: req.user.id } });
    await WalletTransaction.create({
      user_id: req.user.id,
      amount,
      type: 'debit',
      description,
      reference_id
    });
    res.json({ balance: newBalance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};