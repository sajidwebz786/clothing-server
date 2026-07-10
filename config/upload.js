const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v2: cloudinary } = require('cloudinary');
require('dotenv').config();

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024;
const useCloudinary = Boolean(process.env.CLOUDINARY_URL);

if (useCloudinary) {
  cloudinary.config({ secure: true });
}

// Ensure upload directories exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const productsDir = path.join(__dirname, '../uploads/products');
const categoriesDir = path.join(__dirname, '../uploads/categories');

ensureDir(productsDir);
ensureDir(categoriesDir);

// Storage for product images
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

// Storage for category images
const categoryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, categoriesDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, JPG, PNG, WEBP, and GIF are allowed.'), false);
  }
};

const uploadBufferToCloudinary = (file, folder) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `wildzoc/${folder}`,
        resource_type: 'image',
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(file.buffer);
  });
};

const attachCloudinaryUrls = async (req, folder) => {
  if (!useCloudinary) return;

  if (req.files?.length) {
    req.files = await Promise.all(req.files.map(async (file) => {
      const result = await uploadBufferToCloudinary(file, folder);
      return { ...file, filename: result.secure_url, path: result.secure_url, cloudinary_public_id: result.public_id };
    }));
  }

  if (req.file) {
    const result = await uploadBufferToCloudinary(req.file, folder);
    req.file = { ...req.file, filename: result.secure_url, path: result.secure_url, cloudinary_public_id: result.public_id };
  }
};

// Middleware factory for products (handles multiple images)
const uploadProducts = (req, res, next) => {
  multer({
    storage: useCloudinary ? multer.memoryStorage() : productStorage,
    limits: { fileSize: MAX_SIZE },
    fileFilter
  }).array('images', 5)(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({ error: 'Maximum 5 images allowed' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size must be less than 5MB' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    try {
      await attachCloudinaryUrls(req, 'products');
      next();
    } catch (error) {
      return res.status(500).json({ error: `Cloudinary upload failed: ${error.message}` });
    }
  });
};

// Middleware factory for categories (handles single image)
const uploadCategory = (req, res, next) => {
  multer({
    storage: useCloudinary ? multer.memoryStorage() : categoryStorage,
    limits: { fileSize: MAX_SIZE },
    fileFilter
  }).single('image')(req, res, async (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File size must be less than 5MB' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }
    try {
      await attachCloudinaryUrls(req, 'categories');
      next();
    } catch (error) {
      return res.status(500).json({ error: `Cloudinary upload failed: ${error.message}` });
    }
  });
};

const generateImagePath = (filename, type) => {
  if (filename?.startsWith('http')) return filename;
  const folder = type === 'category' ? 'categories' : 'products';
  return `/uploads/${folder}/${filename}`;
};

module.exports = { uploadProducts, uploadCategory, generateImagePath };
