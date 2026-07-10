const { Address } = require('../models');

exports.getAddresses = async (req, res) => {
  try {
    const addresses = await Address.findAll({ where: { user_id: req.user.id } });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createAddress = async (req, res) => {
  try {
    const { name, address_line1, address_line2, city, state, pincode, country, address_type, is_default, latitude, longitude } = req.body;
    if (is_default) {
      await Address.update({ is_default: false }, { where: { user_id: req.user.id } });
    }
    const address = await Address.create({
      user_id: req.user.id,
      name,
      address_line1,
      address_line2,
      city,
      state,
      pincode,
      country,
      address_type,
      is_default: is_default || false,
      latitude,
      longitude
    });
    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateAddress = async (req, res) => {
  try {
    const { name, address_line1, address_line2, city, state, pincode, country, address_type, is_default, latitude, longitude } = req.body;
    if (is_default) {
      await Address.update({ is_default: false }, { where: { user_id: req.user.id } });
    }
    await Address.update(
      { name, address_line1, address_line2, city, state, pincode, country, address_type, is_default, latitude, longitude },
      { where: { id: req.params.id, user_id: req.user.id } }
    );
    const address = await Address.findByPk(req.params.id);
    res.json(address);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    await Address.destroy({ where: { id: req.params.id, user_id: req.user.id } });
    res.json({ message: 'Address deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.setDefaultAddress = async (req, res) => {
  try {
    await Address.update({ is_default: false }, { where: { user_id: req.user.id } });
    await Address.update({ is_default: true }, { where: { id: req.params.id, user_id: req.user.id } });
    res.json({ message: 'Default address updated' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};