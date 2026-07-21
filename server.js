const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { sequelize, Category, Product, User } = require('./models');
const { uploadProducts, uploadCategory, generateImagePath } = require('./config/upload');
const { importExistingImages, assignCategoryImages } = require('./utils/importImages');
const { adminAuth } = require('./middleware/auth');
const { normalizeProductImages } = require('./utils/productImages');
require('dotenv').config();

const app = express();

const repairProductImages = async () => {
  const products = await Product.findAll();
  let repaired = 0;
  for (const product of products) {
    const storedImages = product.getDataValue('images');
    const cleanImages = normalizeProductImages(storedImages);
    if (JSON.stringify(storedImages || []) !== JSON.stringify(cleanImages)) {
      product.setDataValue('images', cleanImages);
      product.changed('images', true);
      await product.save({ fields: ['images'] });
      repaired += 1;
    }
  }
  if (repaired) console.log(`Repaired image URLs for ${repaired} product(s)`);
};

// Ensure upload directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const productsUploadDir = path.join(uploadsDir, 'products');
const categoriesUploadDir = path.join(uploadsDir, 'categories');

[uploadsDir, productsUploadDir, categoriesUploadDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

app.use(cors());
app.use(express.json({
  verify: (req, res, buffer) => {
    if (req.originalUrl === '/api/orders/razorpay/webhook') req.rawBody = buffer;
  }
}));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/returns', require('./routes/returns'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/admin', require('./routes/admin'));

app.post('/api/upload/product', (req, res) => {
  req.headers['upload-type'] = 'product';
  uploadProducts(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    const files = req.files.map(file => generateImagePath(file.filename, 'product'));
    res.json({ images: files });
  });
});

app.post('/api/upload/category', (req, res) => {
  req.headers['upload-type'] = 'category';
  uploadCategory(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const image = generateImagePath(req.file.filename, 'category');
    res.json({ image });
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.get('/api/refresh-images', adminAuth, async (req, res) => {
  if (process.env.ALLOW_SAMPLE_IMAGE_REFRESH !== 'true') {
    return res.status(403).json({ message: 'Sample image refresh is disabled. Manage product images from admin.' });
  }
  try {
    const products = await Product.findAll();
    let idx = 0;
    for (const p of products) {
      await p.update({ images: [validImages[idx % validImages.length]] });
      idx++;
    }
    res.json({ message: 'Images refreshed', count: products.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    await sequelize.sync({ alter: true });
    res.json({ message: 'Database synced' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/import-images', adminAuth, async (req, res) => {
  try {
    const result = await importExistingImages();
    const categoryResult = await assignCategoryImages();
    res.json({
      message: 'Images imported successfully',
      productsUpdated: result.productsUpdated,
      imagesCopied: result.imagesCopied,
      categoriesUpdated: categoryResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;

const validImages = [
  '/uploads/products/placeholder-wildzoc-1.jpeg',
  '/uploads/products/placeholder-wildzoc-2.jpeg'
];

const catalogCategories = [
  {
    name: 'Unisex',
    slug: 'unisex',
    description: 'Versatile daily wear, festive pieces, and easy layers curated for everyone.'
  },
  {
    name: 'Kids',
    slug: 'kids',
    description: 'Bright, comfortable outfits for play days, celebrations, and everyday smiles.'
  }
];

const productSeeds = [
  {
    name: 'Wildzoc Printed Co-Ord Set',
    slug: 'wildzoc-printed-co-ord-set',
    description: 'Soft patterned co-ord set with a relaxed unisex fit for everyday comfort.',
    category: 'unisex',
    price: 99,
    original_price: null,
    discount_percentage: 0,
    stock: 42,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Pink', 'Blue', 'White'],
    is_featured: true,
    is_bestseller: true
  },
  {
    name: 'Everyday Cotton Kurta',
    slug: 'everyday-cotton-kurta',
    description: 'Breathable cotton kurta with clean lines and easy styling for all-day wear.',
    category: 'unisex',
    price: 99,
    original_price: null,
    discount_percentage: 0,
    stock: 36,
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['Sky Blue', 'Rose', 'Navy'],
    is_featured: true
  },
  {
    name: 'Weekend Pattern Shirt',
    slug: 'weekend-pattern-shirt',
    description: 'Lightweight pattern shirt that pairs neatly with denim, chinos, or ethnic bottoms.',
    category: 'unisex',
    price: 49,
    original_price: null,
    discount_percentage: 0,
    stock: 55,
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Blue', 'Black', 'Pink'],
    is_bestseller: true
  },
  {
    name: 'Festive Layered Set',
    slug: 'festive-layered-set',
    description: 'Statement festive layer with a modern cut and comfortable movement.',
    category: 'unisex',
    price: 99,
    original_price: null,
    discount_percentage: 0,
    stock: 20,
    sizes: ['M', 'L', 'XL'],
    colors: ['Royal Blue', 'Blush', 'Ivory'],
    is_clearance: true
  },
  {
    name: 'Kids Floral Frock',
    slug: 'kids-floral-frock',
    description: 'Playful floral frock with a soft lining and bright Wildzoc detailing.',
    category: 'kids',
    price: 49,
    original_price: null,
    discount_percentage: 0,
    stock: 48,
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Pink', 'Blue', 'Yellow'],
    is_featured: true,
    is_bestseller: true
  },
  {
    name: 'Kids Smart Casual Set',
    slug: 'kids-smart-casual-set',
    description: 'A comfortable two-piece outfit made for school events, birthdays, and weekends.',
    category: 'kids',
    price: 99,
    original_price: null,
    discount_percentage: 0,
    stock: 40,
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Blue', 'White', 'Red'],
    is_featured: true
  },
  {
    name: 'Kids Celebration Dress',
    slug: 'kids-celebration-dress',
    description: 'Dressy kids outfit with a polished finish for festive and family occasions.',
    category: 'kids',
    price: 99,
    original_price: null,
    discount_percentage: 0,
    stock: 26,
    sizes: ['3-4Y', '5-6Y', '7-8Y', '9-10Y'],
    colors: ['Pink', 'Purple', 'Blue'],
    is_bestseller: true
  },
  {
    name: 'Kids Playday Cotton Tee',
    slug: 'kids-playday-cotton-tee',
    description: 'Easy cotton tee for active days, styled with cheerful color options.',
    category: 'kids',
    price: 49,
    original_price: null,
    discount_percentage: 0,
    stock: 60,
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Pink', 'Blue', 'Green'],
    is_clearance: true
  }
];

const legacyProductUpdates = [
  {
    slug: 'girls-floral-frocks',
    name: 'Kids Floral Outfit',
    description: 'Bright floral outfit for kids with soft comfort for celebrations and everyday wear.',
    category: 'kids',
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Pink', 'White', 'Yellow']
  },
  {
    slug: 'girls-winter-jacket',
    name: 'Kids Cozy Jacket',
    description: 'Warm kids jacket with cheerful colors and an easy everyday fit.',
    category: 'kids',
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Red', 'Pink', 'Blue']
  },
  {
    slug: 'boys-cotton-tshirt-set',
    name: 'Kids Cotton T-Shirt Set',
    description: 'Comfortable cotton t-shirt set for kids with playful color options.',
    category: 'kids',
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Blue', 'Red', 'White']
  },
  {
    slug: 'boys-denim-jeans',
    name: 'Kids Denim Jeans',
    description: 'Durable denim jeans for kids, made for easy movement and daily wear.',
    category: 'kids',
    sizes: ['2-3Y', '4-5Y', '6-7Y', '8-9Y'],
    colors: ['Blue', 'Black']
  },
  {
    slug: 'boys-party-wear-suit',
    name: 'Kids Celebration Suit',
    description: 'Smart celebration suit for kids with a polished festive look.',
    category: 'kids',
    sizes: ['3-4Y', '5-6Y', '7-8Y', '9-10Y'],
    colors: ['Navy', 'Black']
  },
  {
    slug: 'girls-designer-kurti',
    name: 'Kids Festive Kurti Set',
    description: 'Festive kurti set for kids with color and comfort for family occasions.',
    category: 'kids',
    sizes: ['3-4Y', '5-6Y', '7-8Y', '9-10Y'],
    colors: ['Pink', 'Purple']
  },
  {
    slug: 'ladies-western-dress',
    name: 'Unisex Modern Layered Dress',
    description: 'Modern layered outfit with a relaxed unisex silhouette and easy styling.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Navy']
  },
  {
    slug: 'ladies-designer-kurti-set',
    name: 'Unisex Designer Kurta Set',
    description: 'Designer kurta set with a comfortable unisex fit and fresh Wildzoc colors.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Pink', 'Blue', 'Green']
  },
  {
    slug: 'ladies-silk-saree',
    name: 'Unisex Festive Drape Set',
    description: 'Festive drape-inspired set for expressive styling and special occasions.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Red', 'Blue', 'Green', 'Maroon']
  },
  {
    slug: 'ladies-anarkali-suit',
    name: 'Unisex Festive Anarkali Set',
    description: 'Festive anarkali-inspired set with an elegant flow and comfortable fit.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Red', 'Pink']
  },
  {
    slug: 'gents-formal-shirt',
    name: 'Unisex Formal Shirt',
    description: 'Premium formal shirt with clean tailoring for everyday polished dressing.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    colors: ['White', 'Blue', 'Light Blue']
  },
  {
    slug: 'gents-blazer-set',
    name: 'Unisex Blazer Set',
    description: 'Sharp blazer set with a versatile unisex cut for smart occasions.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Navy', 'Grey']
  },
  {
    slug: 'gents-casual-jeans',
    name: 'Unisex Casual Jeans',
    description: 'Comfortable casual jeans with a versatile fit for daily styling.',
    category: 'unisex',
    sizes: ['28', '30', '32', '34', '36'],
    colors: ['Blue', 'Black']
  },
  {
    slug: 'gents-ethnic-kurta',
    name: 'Unisex Ethnic Kurta',
    description: 'Traditional ethnic kurta with a clean unisex fit.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['White', 'Cream']
  },
  {
    slug: 'gents-winter-coat',
    name: 'Unisex Winter Coat',
    description: 'Warm winter coat with a versatile silhouette for layered styling.',
    category: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Brown', 'Navy']
  }
];

const seedData = async () => {
  try {
    // Seed admin user
    const [adminUser, createdAdmin] = await User.findOrCreate({
      where: { email: 'admin@wildzoc.com' },
      defaults: {
        name: 'Wildzoc Admin',
        email: 'admin@wildzoc.com',
        password: 'admin123',
        role: 'admin',
        is_verified: true
      }
    });
    if (!createdAdmin) {
      await adminUser.update({
        name: 'Wildzoc Admin',
        password: 'admin123',
        role: 'admin',
        is_verified: true
      });
    }
    if (createdAdmin) {
      console.log('Admin user created: admin@wildzoc.com / admin123');
    }

    const categoryMap = {};
    for (const categoryData of catalogCategories) {
      const [category] = await Category.findOrCreate({
        where: { slug: categoryData.slug },
        defaults: categoryData
      });
      await category.update({ ...categoryData, is_active: true });
      categoryMap[categoryData.slug] = category;
    }

    const allCategories = await Category.findAll();
    const oldKidsCategoryIds = allCategories
      .filter(category => category.slug && category.slug.includes('kids') && category.slug !== 'kids')
      .map(category => category.id);
    const oldUnisexCategoryIds = allCategories
      .filter(category => category.slug && !['kids', 'unisex'].includes(category.slug) && !category.slug.includes('kids'))
      .map(category => category.id);

    if (oldKidsCategoryIds.length > 0) {
      await Product.update(
        { category_id: categoryMap.kids.id },
        { where: { category_id: oldKidsCategoryIds } }
      );
    }

    if (oldUnisexCategoryIds.length > 0) {
      await Product.update(
        { category_id: categoryMap.unisex.id },
        { where: { category_id: oldUnisexCategoryIds } }
      );
    }

    await Category.update(
      { is_active: false },
      { where: { slug: allCategories.map(category => category.slug).filter(slug => !['unisex', 'kids'].includes(slug)) } }
    );

    const existingProductCount = await Product.count();
    if (existingProductCount > 0) {
      console.log(`Catalog already has ${existingProductCount} products. Skipping product seed overwrite so admin edits persist.`);
      return;
    }

    for (const productData of productSeeds) {
      const { category, ...productFields } = productData;
      const [product, created] = await Product.findOrCreate({
        where: { slug: productFields.slug },
        defaults: {
          ...productFields,
          category_id: categoryMap[category].id,
          is_active: true
        }
      });

      if (!created) {
        await product.update({
          ...productFields,
          category_id: categoryMap[category].id,
          is_active: true
        });
      }
    }

    for (const productData of legacyProductUpdates) {
      const { category, ...productFields } = productData;
      await Product.update(
        {
          ...productFields,
          category_id: categoryMap[category].id,
          is_active: true
        },
        { where: { slug: productFields.slug } }
      );
    }

    console.log('Catalog reconciled: active categories are Unisex and Kids');
  } catch (error) {
    console.error('Seed error:', error);
  }
};

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database connected and synced');
  await seedData();
  await repairProductImages();

  if (process.env.AUTO_IMPORT_IMAGES === 'true') {
    try {
      console.log('\nProcessing product and category images...');
      await importExistingImages();
      await assignCategoryImages();
      console.log('Image import completed');
    } catch (err) {
      console.error('Image import error:', err.message);
    }
  } else {
    console.log('Image auto-import disabled. Product images are managed from admin.');
  }

  app.listen(PORT, () => {
    console.log(`\nServer running on port ${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api`);
    console.log('');
    console.log('Admin portal: http://localhost:3000/login');
    console.log('Website: http://localhost:3000');
    console.log('');
    console.log('Admin credentials: admin@wildzoc.com / admin123');
  });
}).catch(err => {
  console.error('Database connection error:', err);
});
