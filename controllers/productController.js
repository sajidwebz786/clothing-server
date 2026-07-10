const { Product, Category } = require('../models');
const { Op } = require('sequelize');

const generateImagePath = (filename) => filename?.startsWith('http') ? filename : `/uploads/products/${filename}`;
const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseJsonField = (field) => {
  if (field === undefined || field === null) return undefined;
  if (Array.isArray(field)) return field;
  if (typeof field === 'string' && field.trim() === '') return [];
  if (typeof field === 'string' && (field.includes(',') || field.includes('\n'))) {
    return field.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
  }
  try {
    const parsed = JSON.parse(field);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [field];
  }
};

const parseBoolean = (value) => value === true || value === 'true' || value === '1' || value === 1;
const uniqueList = (items = []) => [...new Set(items.filter(Boolean))];

const normalizeProductData = (data) => {
  if (!data) return data;
  const next = { ...data };
  if (next.price !== undefined) next.price = Number(next.price || 0);
  if (next.original_price === '' || next.original_price === undefined) next.original_price = null;
  else next.original_price = Number(next.original_price || 0);
  if (next.discount_percentage !== undefined) next.discount_percentage = Number(next.discount_percentage || 0);
  if (next.stock !== undefined) next.stock = Number(next.stock || 0);
  ['is_featured', 'is_bestseller', 'is_clearance', 'is_active'].forEach((key) => {
    if (next[key] !== undefined) next[key] = parseBoolean(next[key]);
  });
  return next;
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
    
    const requestedImages = parseJsonField(productData.images);
    if (requestedImages !== undefined) {
      productData.images = requestedImages;
    }

    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files.map(file => generateImagePath(file.filename));
      productData.images = uniqueList([...(productData.images || []), ...uploadedImages]);
    } else if (requestedImages !== undefined) {
      productData.images = uniqueList(requestedImages);
    }
    
    if (productData.sizes) {
      productData.sizes = parseJsonField(productData.sizes);
    }
    if (productData.colors) {
      productData.colors = parseJsonField(productData.colors);
    }
    
    ['is_featured', 'is_bestseller', 'is_clearance'].forEach((key) => {
      if (productData[key] === undefined) productData[key] = false;
    });
    if (productData.is_active === undefined) productData.is_active = true;

    const product = await Product.create(normalizeProductData(productData));
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
    const replaceImages = req.query.replaceImages === 'true' || req.body.replaceImages === 'true';
    delete updateData.replaceImages;
    
    const requestedImages = parseJsonField(updateData.images);
    if (requestedImages !== undefined) {
      updateData.images = requestedImages;
    }

    if (req.files && req.files.length > 0) {
      const uploadedImages = req.files.map(file => generateImagePath(file.filename));
      const baseImages = replaceImages ? (requestedImages || []) : [...(product.images || []), ...(requestedImages || [])];
      updateData.images = uniqueList([...baseImages, ...uploadedImages]);
    } else if (requestedImages !== undefined) {
      updateData.images = uniqueList(requestedImages);
    }
    
    if (updateData.sizes) {
      updateData.sizes = parseJsonField(updateData.sizes);
    }
    if (updateData.colors) {
      updateData.colors = parseJsonField(updateData.colors);
    }
    
    await product.update(normalizeProductData(updateData));
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



