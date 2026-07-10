const { Category } = require('../models');
const { uploadCategory } = require('../config/upload');

const generateImagePath = (filename) => `/uploads/categories/${filename}`;

exports.getCategories = async (req, res) => {
  console.log('[SERVER] getCategories called')
  try {
    const categories = await Category.findAll({ where: { is_active: true } });
    console.log(`[SERVER] Found ${categories.length} categories`)
    res.json(categories);
  } catch (error) {
    console.error('[SERVER] Error in getCategories:', error.message)
    res.status(500).json({ message: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    let categoryData = { ...req.body };
    
    if (req.file) {
      categoryData.image = generateImagePath(req.file.filename);
    } else if (req.body.image) {
      categoryData.image = req.body.image;
    }
    
    const category = await Category.create(categoryData);
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.uploadCategoryImage = (req, res) => {
  req.headers['upload-type'] = 'category';
  uploadCategory(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const image = generateImagePath(req.file.filename);
    res.json({ image });
  });
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found' });
    
    let updateData = { ...req.body };
    
    if (req.file) {
      updateData.image = generateImagePath(req.file.filename);
    } else if (req.body.image !== undefined) {
      updateData.image = req.body.image;
    }
    
    await category.update(updateData);
    const updatedCategory = await Category.findByPk(req.params.id);
    res.json(updatedCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    await Category.update({ is_active: false }, { where: { id: req.params.id } });
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

