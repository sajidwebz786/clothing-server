const fs = require('fs');
const path = require('path');
const { sequelize, Product, Category } = require('../models');

const SOURCE_IMAGES_DIR = path.join(__dirname, '..', '..', 'clothing-web', 'src', 'assets', 'images');
const DESTINATION_PRODUCTS_DIR = path.join(__dirname, '..', 'uploads', 'products');
const DESTINATION_CATEGORIES_DIR = path.join(__dirname, '..', 'uploads', 'categories');

/**
 * Batch import existing images from clothing-web/src/assets/images/
 * and link them to products in the database
 */
const importExistingImages = async () => {
  try {
    console.log('Starting batch image import...');
    console.log('Source directory:', SOURCE_IMAGES_DIR);

    // Check if source directory exists
    if (!fs.existsSync(SOURCE_IMAGES_DIR)) {
      console.error('Source images directory does not exist:', SOURCE_IMAGES_DIR);
      return;
    }

    // Get all image files from source directory. Keep local garment photos first.
    const allFiles = fs.readdirSync(SOURCE_IMAGES_DIR).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    });
    const files = [
      ...allFiles.filter(file => file.toLowerCase().includes('whatsapp')),
      ...allFiles.filter(file => !file.toLowerCase().includes('whatsapp') && file !== 'logo.png')
    ];

    console.log(`Found ${files.length} image files`);

    // Get all products from database
    const products = await Product.findAll({
      order: [['createdAt', 'ASC']]
    });

    console.log(`Found ${products.length} products in database`);

    if (products.length === 0) {
      console.log('No products found in database. Skipping image import.');
      return;
    }

    // Get all categories for reference
    const categories = await Category.findAll();

    // Create a mapping from category_id to category name for better matching
    const categoryMap = {};
    categories.forEach(cat => {
      categoryMap[cat.id] = cat.name.toLowerCase();
    });

    // Create destination directory if it doesn't exist
    if (!fs.existsSync(DESTINATION_PRODUCTS_DIR)) {
      fs.mkdirSync(DESTINATION_PRODUCTS_DIR, { recursive: true });
    }

    let imageIndex = 0;
    const productsToUpdate = [];

    // Assign images to products that don't already have images
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      const hasLocalUploads = product.images &&
        Array.isArray(product.images) &&
        product.images.length > 0 &&
        product.images.every(image => typeof image === 'string' && image.startsWith('/uploads/products/'));

      // Replace old Unsplash/external images, but keep already imported local uploads.
      if (hasLocalUploads) {
        console.log(`Skipping product ${product.name}: already has ${product.images.length} local images`)
        continue
      }

      // Assign 1-2 images per product based on available files
      const productImages = [];
      const imagesPerProduct = Math.min(2, Math.floor((files.length - imageIndex) / (products.length - i)) || 1);

      for (let j = 0; j < imagesPerProduct && imageIndex < files.length; j++, imageIndex++) {
        const sourceFile = files[imageIndex];
        const sourcePath = path.join(SOURCE_IMAGES_DIR, sourceFile);

        // Generate unique filename
        const timestamp = Date.now();
        const ext = path.extname(sourceFile);
        const baseName = path.basename(sourceFile, ext);
        const newFilename = `${timestamp}-${i}-${j}-${baseName.replace(/[^a-zA-Z0-9]/g, '')}${ext}`;
        const destPath = path.join(DESTINATION_PRODUCTS_DIR, newFilename);

        // Copy file
        fs.copyFileSync(sourcePath, destPath);

        // Store relative path for database
        const imagePath = `/uploads/products/${newFilename}`;
        productImages.push(imagePath);

        console.log(`Copied ${sourceFile} -> ${newFilename} for product: ${product.name}`);
      }

      if (productImages.length > 0) {
        productsToUpdate.push({
          id: product.id,
          images: productImages
        });
      }
    }

    // Batch update products with images
    for (const update of productsToUpdate) {
      await Product.update(
        { images: update.images },
        { where: { id: update.id } }
      );
    }

    console.log(`\nSuccessfully updated ${productsToUpdate.length} products with images`);
    console.log(`Total images copied: ${imageIndex}`);
    console.log('Batch image import completed!');

    return {
      productsUpdated: productsToUpdate.length,
      imagesCopied: imageIndex
    };

  } catch (error) {
    console.error('Batch image import error:', error);
    throw error;
  }
};

/**
 * Category image mapping based on category name
 */
const assignCategoryImages = async () => {
  try {
    console.log('\nAssigning category images...');

    const categoriesDir = path.join(__dirname, '..', '..', 'clothing-web', 'src', 'assets', 'images');
    const destinationDir = path.join(__dirname, '..', 'uploads', 'categories');

    if (!fs.existsSync(categoriesDir)) {
      console.error('Source images directory not found:', categoriesDir);
      return;
    }

    // Ensure destination exists
    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    // Category-specific image mapping (by keywords in filename)
    const categoryKeywords = {
      'Unisex': ['whatsapp', 'men', 'man', 'woman', 'gents', 'ladies'],
      'Kids': ['kids', 'girls', 'boys', 'kid']
    };

    const categories = await Category.findAll();
    const files = fs.readdirSync(categoriesDir).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
    });

    let updatedCount = 0

    for (const category of categories) {
      if (category.image && category.image.startsWith('/uploads/categories/')) {
        console.log(`Skipping category ${category.name}: already has local image`)
        continue
      }

      const keywords = categoryKeywords[category.name] || [];

      // Find matching image for this category
      const match = files.find(file => {
        const lowerFile = file.toLowerCase();
        return keywords.some(keyword => lowerFile.includes(keyword.toLowerCase()));
      });

      if (match) {
        const sourcePath = path.join(categoriesDir, match);
        const timestamp = Date.now();
        const ext = path.extname(match);
        const newFilename = `${timestamp}-${category.slug}${ext}`;
        const destPath = path.join(destinationDir, newFilename);

        fs.copyFileSync(sourcePath, destPath);
        const imagePath = `/uploads/categories/${newFilename}`;

        await Category.update(
          { image: imagePath },
          { where: { id: category.id } }
        );

        console.log(`Assigned category image for "${category.name}": ${match} -> ${newFilename}`);
        updatedCount++
      } else {
        console.log(`No matching image found for category: ${category.name}`);
      }
    }

    return updatedCount

  } catch (error) {
    console.error('Category image assignment error:', error);
    throw error;
  }
};

/**
 * Main import function - call this after database sync
 */
const runImport = async () => {
  try {
    await importExistingImages();
    await assignCategoryImages();
    console.log('\n✅ All image imports completed successfully!');
  } catch (error) {
    console.error('❌ Import failed:', error.message);
  }
};

// Run if called directly
if (require.main === module) {
  runImport().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  importExistingImages,
  assignCategoryImages,
  runImport
};
