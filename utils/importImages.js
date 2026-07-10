const fs = require('fs');
const path = require('path');
const { v2: cloudinary } = require('cloudinary');
const { sequelize, Product, Category } = require('../models');
require('dotenv').config();

const SOURCE_IMAGES_DIR = path.join(__dirname, '..', '..', 'clothing-web', 'src', 'assets', 'images');
const DESTINATION_PRODUCTS_DIR = path.join(__dirname, '..', 'uploads', 'products');
const DESTINATION_CATEGORIES_DIR = path.join(__dirname, '..', 'uploads', 'categories');
const USE_CLOUDINARY = Boolean(process.env.CLOUDINARY_URL);

if (USE_CLOUDINARY) {
  cloudinary.config({ secure: true });
}

const isImageUrl = (image) => typeof image === 'string' && image.startsWith('http');

const isBrandAsset = (resource) => {
  const text = `${resource.public_id || ''} ${resource.filename || ''} ${resource.secure_url || ''}`.toLowerCase();
  return ['logo', 'qr', 'hypzo', 'oldlogo', 'dark-logo', 'full-logo'].some((word) => text.includes(word));
};

const getCloudinaryImages = async (folder) => {
  if (!USE_CLOUDINARY) return [];

  const collect = async (options) => {
    const resources = [];
    let nextCursor;
    do {
      const result = await cloudinary.api.resources({
        resource_type: 'image',
        type: 'upload',
        max_results: 100,
        ...options,
        next_cursor: nextCursor
      });
      resources.push(...(result.resources || []));
      nextCursor = result.next_cursor;
    } while (nextCursor && resources.length < 500);
    return resources;
  };

  let resources = await collect({ prefix: `wildzoc/${folder}` });
  if (resources.length === 0) {
    resources = await collect({});
  }

  return resources
    .filter((resource) => resource.secure_url && !isBrandAsset(resource))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map((resource) => resource.secure_url);
};

const productHasCloudinaryImages = (product) => (
  Array.isArray(product.images) &&
  product.images.length > 0 &&
  product.images.some(isImageUrl)
);

/**
 * Batch import existing images from clothing-web/src/assets/images/
 * and link them to products in the database
 */
const importExistingImages = async () => {
  try {
    console.log('Starting batch image import...');

    if (USE_CLOUDINARY) {
      const cloudinaryImages = await getCloudinaryImages('products');
      if (cloudinaryImages.length > 0) {
        const products = await Product.findAll({ order: [['createdAt', 'ASC']] });
        let imageIndex = 0;
        let productsUpdated = 0;

        for (const product of products) {
          if (productHasCloudinaryImages(product)) {
            console.log(`Skipping product ${product.name}: already has Cloudinary/external images`);
            continue;
          }

          const first = cloudinaryImages[imageIndex % cloudinaryImages.length];
          const second = cloudinaryImages[(imageIndex + 1) % cloudinaryImages.length];
          const images = first === second ? [first] : [first, second];
          await product.update({ images });
          imageIndex += 2;
          productsUpdated++;
        }

        console.log(`Assigned Cloudinary images to ${productsUpdated} products`);
        return {
          productsUpdated,
          imagesCopied: 0,
          source: 'cloudinary'
        };
      }

      console.log('Cloudinary is configured, but no image resources were found. Falling back to local image import.');
    }

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

      if (productHasCloudinaryImages(product)) {
        console.log(`Skipping product ${product.name}: already has Cloudinary/external images`);
        continue;
      }

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

    if (USE_CLOUDINARY) {
      const cloudinaryImages = await getCloudinaryImages('categories');
      if (cloudinaryImages.length > 0) {
        const categories = await Category.findAll({ order: [['createdAt', 'ASC']] });
        let updatedCount = 0;

        for (let index = 0; index < categories.length; index++) {
          const category = categories[index];
          if (isImageUrl(category.image)) {
            console.log(`Skipping category ${category.name}: already has Cloudinary/external image`);
            continue;
          }
          await category.update({ image: cloudinaryImages[index % cloudinaryImages.length] });
          updatedCount++;
        }

        console.log(`Assigned Cloudinary images to ${updatedCount} categories`);
        return updatedCount;
      }

      console.log('Cloudinary is configured, but no category image resources were found. Falling back to local category images.');
    }

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
      if (isImageUrl(category.image)) {
        console.log(`Skipping category ${category.name}: already has Cloudinary/external image`)
        continue
      }

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
