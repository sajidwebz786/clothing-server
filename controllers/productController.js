const { Product, Category } = require('../models');
const { Op } = require('sequelize');

const generateImagePath = (filename) => filename?.startsWith('http') ? filename : `/uploads/products/${filename}`;
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseJsonField = (field) => {
  if (!field) return undefined;
  if (Array.isArray(field)) return field;
  // If it's a string that looks like comma-separated, split it
  if (typeof field === 'string' && field.includes(',')) {
    return field.split(',').map(item => item.trim()).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [field];
  }
};

const normalizePrice = (data) => {
  if (!data) return data;
  const requested = Number(data.price);
  return {
    ...data,
    price: requested === 99 ? 99 : 49,
    original_price: null,
    discount_percentage: 0
  };
};

exports.getProducts = async (req, res) => {
  try {
    const { category, search, minPrice, maxPrice, sort, page = 1, limit = 12 } = req.query;
    const where = { is_active: true };
    if (category) {
      const categoryRecord = await Category.findOne({
        where: isUuid(category)
          ? { id: category, is_active: true }
          : { slug: category, is_active: true }
      });

      if (!categoryRecord) {
        return res.json({ products: [], total: 0, page: parseInt(page), totalPages: 0 });
      }

      where.category_id = categoryRecord.id;
    }
    if (search) where.name = { [Op.iLike]: `%${search}%` };
    if (minPrice && maxPrice) where.price = { [Op.between]: [minPrice, maxPrice] };
    let order = [['createdAt', 'DESC']];
    if (sort === 'price_asc') order = [['price', 'ASC']];
    if (sort === 'price_desc') order = [['price', 'DESC']];
    if (sort === 'popular') order = [['is_bestseller', 'DESC']];
    const offset = (page - 1) * limit;
    const { count, rows } = await Product.findAndCountAll({
      where,
      order,
      limit: parseInt(limit),
      offset,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }]
    });
    res.json({ products: rows, total: count, page: parseInt(page), totalPages: Math.ceil(count / limit) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const lookup = req.params.id;
    const product = await Product.findOne({
      where: isUuid(lookup)
        ? { id: lookup, is_active: true }
        : { slug: lookup, is_active: true },
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }]
    });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getFeaturedProducts = async (req, res) => {
  console.log('[SERVER] getFeaturedProducts called')
  try {
    const products = await Product.findAll({
      where: { is_active: true, is_featured: true },
      limit: 8,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }]
    });
    console.log(`[SERVER] Found ${products.length} featured products`)
    res.json(products);
  } catch (error) {
    console.error('[SERVER] Error in getFeaturedProducts:', error.message)
    res.status(500).json({ message: error.message });
  }
};

exports.getBestsellers = async (req, res) => {
  console.log('[SERVER] getBestsellers called')
  try {
    const products = await Product.findAll({
      where: { is_active: true, is_bestseller: true },
      limit: 8,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }]
    });
    console.log(`[SERVER] Found ${products.length} bestseller products`)
    res.json(products);
  } catch (error) {
    console.error('[SERVER] Error in getBestsellers:', error.message)
    res.status(500).json({ message: error.message });
  }
};

exports.getClearanceProducts = async (req, res) => {
  console.log('[SERVER] getClearanceProducts called')
  try {
    const products = await Product.findAll({
      where: { is_active: true, is_clearance: true },
      limit: 8,
      include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }]
    });
    console.log(`[SERVER] Found ${products.length} clearance products`)
    res.json(products);
  } catch (error) {
    console.error('[SERVER] Error in getClearanceProducts:', error.message)
    res.status(500).json({ message: error.message });
  }
};

exports.uploadProductImages = (req, res) => {
  req.headers['upload-type'] = 'product';
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'At least one image is required' });
  }
  const images = req.files.map(file => generateImagePath(file.filename));
  res.json({ images });
};

exports.createProduct = async (req, res) => {
  try {
    let productData = { ...req.body };
    
    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files.map(file => generateImagePath(file.filename));
      
      if (productData.images) {
        const existingImages = parseJsonField(productData.images);
        if (Array.isArray(existingImages)) {
          productData.images = [...existingImages, ...uploadedImages];
        } else {
          productData.images = [existingImages, ...uploadedImages];
        }
      } else {
        productData.images = uploadedImages;
      }
    } else if (productData.images) {
      productData.images = parseJsonField(productData.images);
    }
    
    if (productData.sizes) {
      productData.sizes = parseJsonField(productData.sizes);
    }
    if (productData.colors) {
      productData.colors = parseJsonField(productData.colors);
    }
    
    const product = await Product.create(normalizePrice(productData));
    res.status(201).json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    
    let updateData = { ...req.body };
    const replaceImages = req.query.replaceImages === 'true';
    
    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files.map(file => generateImagePath(file.filename));
      
      if (replaceImages) {
        updateData.images = uploadedImages;
      } else if (updateData.images) {
        const existingImages = parseJsonField(updateData.images);
        if (Array.isArray(existingImages)) {
          updateData.images = [...existingImages, ...uploadedImages];
        } else {
          updateData.images = [existingImages, ...uploadedImages];
        }
      } else {
        const currentImages = product.images || [];
        updateData.images = [...currentImages, ...uploadedImages];
      }
    } else if (updateData.images) {
      updateData.images = parseJsonField(updateData.images);
    }
    
    if (updateData.sizes) {
      updateData.sizes = parseJsonField(updateData.sizes);
    }
    if (updateData.colors) {
      updateData.colors = parseJsonField(updateData.colors);
    }
    
    await product.update(normalizePrice(updateData));
    const updatedProduct = await Product.findByPk(req.params.id);
    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    await Product.update({ is_active: false }, { where: { id: req.params.id } });
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProductsByCategory = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { category_id: req.params.categoryId, is_active: true }
    });
    console.log(`[SERVER] Found ${products.length} featured products`)
    res.json(products);
  } catch (error) {
    console.error('[SERVER] Error in getFeaturedProducts:', error.message)
    res.status(500).json({ message: error.message });
  }
};



