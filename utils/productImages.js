const normalizeProductImage = (value) => {
  if (typeof value !== 'string') return null;
  let image = value.trim()
    .replace(/^\[+/, '')
    .replace(/\]+$/, '')
    .replace(/^["']+/, '')
    .replace(/["']+$/, '')
    .replace(/\\\//g, '/');

  if (/^https\/\//i.test(image)) image = image.replace(/^https\/\//i, 'https://');
  if (/^http\/\//i.test(image)) image = image.replace(/^http\/\//i, 'http://');
  if (/^https?:\/\//i.test(image) || image.startsWith('/uploads/')) return image;
  return null;
};

const normalizeProductImages = (values) => {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map(normalizeProductImage).filter(Boolean))];
};

module.exports = { normalizeProductImage, normalizeProductImages };
