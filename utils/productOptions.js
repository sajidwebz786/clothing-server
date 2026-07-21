const expandEncodedValues = (value, depth = 0) => {
  if (depth > 12 || value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => expandEncodedValues(item, depth + 1));
  if (typeof value !== 'string') return [String(value)];

  const text = value.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (parsed !== text) return expandEncodedValues(parsed, depth + 1);
  } catch {
    const unescaped = text.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    if (unescaped !== text) return expandEncodedValues(unescaped, depth + 1);
  }
  return [text];
};

const normalizeProductOptions = (values) => {
  const clean = expandEncodedValues(values)
    .map((value) => value
      .replace(/[\\\[\]"']/g, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((value) => value && value.length <= 40)
    .filter((value) => /^[\p{L}\p{N}][\p{L}\p{N}\s+&./()-]*$/u.test(value));
  return [...new Set(clean)];
};

module.exports = { normalizeProductOptions };
