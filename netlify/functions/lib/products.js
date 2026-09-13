// ============================================================
// HamedShop - Products, Variants, Inventory
// ============================================================

const { readJsonFile, writeJsonFile, writeBinaryFile, deleteRepoFile } = require("./github");
const { downloadBaleFile } = require("./bale");
const {
  nowISO,
  generateId,
  generateProductId,
  safeNumber,
  safeText,
  safeArray
} = require("./utils");
const { calculatePricing, applyPricingToProduct } = require("./pricing");

function normalizeProduct(product = {}) {
  const variants = safeArray(product.variants).map((variant) => ({
    id: variant.id || generateId("V"),
    name: safeText(variant.name),
    attributes:
      variant.attributes && typeof variant.attributes === "object"
        ? variant.attributes
        : {},
    price: safeNumber(variant.price ?? product.price),
    stock: Math.max(0, safeNumber(variant.stock)),
    sku: safeText(variant.sku),
    active: variant.active !== false
  }));

  let totalStock = 0;
  if (variants.length > 0) {
    totalStock = variants.reduce(
      (sum, v) => sum + safeNumber(v.stock),
      0
    );
  } else {
    totalStock = Math.max(
      0,
      safeNumber(product.stock ?? product.totalStock)
    );
  }

  const pricing = calculatePricing({
    compareAtPrice:
      product.compareAtPrice ??
      product.originalPrice ??
      product.price ??
      0,
    discountType: product.discountType ?? "none",
    discountValue: product.discountValue ?? 0
  });

  if (
    (product.discountType == null || product.discountType === "") &&
    pricing.compareAtPrice > pricing.price
  ) {
    const amount = pricing.compareAtPrice - pricing.price;
    Object.assign(
      pricing,
      calculatePricing({
        compareAtPrice: pricing.compareAtPrice,
        discountType: "amount",
        discountValue: amount
      })
    );
  }

  let images = safeArray(product.images).filter(Boolean);
  if (images.length === 0 && product.image) {
    images = [product.image];
  }

  return {
    ...product,
    id: product.id || generateProductId(),
    name: safeText(product.name) || "محصول بدون نام",
    description: safeText(product.description),
    categoryId: product.categoryId || null,
    category: safeText(product.category),
    images,
    image: images[0] || "",
    ...pricing,
    currency: product.currency || "IRR",
    attributes:
      product.attributes && typeof product.attributes === "object"
        ? product.attributes
        : {},
    variants,
    stock: totalStock,
    totalStock,
    active: product.active !== false,
    featured: product.featured === true,
    badges: safeArray(product.badges),
    tags: safeArray(product.tags),
    createdAt: product.createdAt || nowISO(),
    updatedAt: nowISO()
  };
}

async function getProductsFile() {
  return readJsonFile("data/products.json", []);
}

async function saveProductsFile(products, sha, message) {
  return writeJsonFile(
    "data/products.json",
    products.map(normalizeProduct),
    message || "Update products",
    sha
  );
}

async function getProduct(productId) {
  const file = await getProductsFile();
  return (
    file.data.map(normalizeProduct).find((p) => p.id === productId) || null
  );
}

async function syncIndexes(products) {
  const variants = [];
  const inventory = [];

  for (const product of products) {
    for (const variant of safeArray(product.variants)) {
      variants.push({
        ...variant,
        productId: product.id,
        productName: product.name,
        updatedAt: nowISO()
      });
    }

    inventory.push({
      productId: product.id,
      productName: product.name,
      stock: product.totalStock,
      active: product.active,
      updatedAt: nowISO(),
      variants: safeArray(product.variants).map((v) => ({
        variantId: v.id,
        name: v.name,
        stock: v.stock
      }))
    });
  }

  const variantsFile = await readJsonFile("data/variants.json", []);
  const inventoryFile = await readJsonFile("data/inventory.json", []);

  await writeJsonFile(
    "data/variants.json",
    variants,
    "Sync variants",
    variantsFile.sha
  );

  await writeJsonFile(
    "data/inventory.json",
    inventory,
    "Sync inventory",
    inventoryFile.sha
  );
}

async function createProduct(product) {
  const file = await getProductsFile();

  const normalized = normalizeProduct({
    ...product,
    id: product.id || generateProductId(),
    createdAt: product.createdAt || nowISO(),
    updatedAt: nowISO()
  });

  file.data.push(normalized);

  await saveProductsFile(
    file.data,
    file.sha,
    `Add product ${normalized.id}`
  );

  await syncIndexes(file.data);
  return normalized;
}

async function updateProduct(productId, changes) {
  const file = await getProductsFile();
  const products = file.data.map(normalizeProduct);
  const index = products.findIndex((p) => p.id === productId);

  if (index === -1) {
    throw new Error("Product not found");
  }

  const merged = {
    ...products[index],
    ...changes,
    id: productId,
    updatedAt: nowISO()
  };

  products[index] = normalizeProduct(merged);

  await saveProductsFile(products, file.sha, `Update product ${productId}`);
  await syncIndexes(products);

  return products[index];
}

async function deleteProduct(productId) {
  const file = await getProductsFile();
  const products = file.data.map(normalizeProduct);
  const index = products.findIndex((p) => p.id === productId);

  if (index === -1) {
    throw new Error("Product not found");
  }

  const deleted = products.splice(index, 1)[0];

  await saveProductsFile(products, file.sha, `Delete product ${productId}`);
  await syncIndexes(products);

  // حذف فایل‌های تصویر مرتبط از ریپو
  try {
    const paths = new Set();
    safeArray(deleted.images).forEach((p) => {
      if (p) paths.add(String(p).trim());
    });
    if (deleted.image) paths.add(String(deleted.image).trim());

    for (const raw of paths) {
      if (!raw || /^https?:\/\//i.test(raw)) continue;
      let rel = raw.replace(/^\.\//, "");
      if (!rel.startsWith("images/")) {
        if (rel.includes("/")) continue;
        rel = "images/" + rel;
      }
      try {
        await deleteRepoFile(rel, `Delete image after product ${productId}`);
      } catch (e) {
        console.warn("image delete failed:", rel, e.message);
      }
    }
  } catch (e) {
    console.warn("deleteProduct images:", e.message);
  }

  return deleted;
}

async function updateProductPricing(productId, pricingInput) {
  const pricing = calculatePricing(pricingInput);
  return updateProduct(productId, pricing);
}

async function uploadBaleImage(fileId, path) {
  const buffer = await downloadBaleFile(fileId);
  await writeBinaryFile(path, buffer, `Upload image ${path}`);
  return path;
}

function parseAttributes(text) {
  const result = {};
  const lines = safeText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    const parts = line.split(":");
    if (parts.length < 2) continue;

    const key = safeText(parts[0]);
    const values = parts
      .slice(1)
      .join(":")
      .split(",")
      .map((v) => safeText(v))
      .filter(Boolean);

    if (key && values.length) {
      result[key] = values;
    }
  }

  return result;
}

function createVariantCombinations(attributes) {
  const keys = Object.keys(attributes || {});
  if (keys.length === 0) return [];

  let combinations = [{}];

  for (const key of keys) {
    const values = attributes[key];
    const next = [];

    for (const combo of combinations) {
      for (const value of values) {
        next.push({ ...combo, [key]: value });
      }
    }
    combinations = next;
  }

  return combinations.map((attrs) => {
    const name = Object.values(attrs).join(" / ");
    return {
      id: generateId("V"),
      name,
      attributes: attrs,
      price: 0,
      stock: 0,
      sku: "",
      active: true
    };
  });
}

module.exports = {
  normalizeProduct,
  getProductsFile,
  saveProductsFile,
  getProduct,
  syncIndexes,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductPricing,
  uploadBaleImage,
  parseAttributes,
  createVariantCombinations
};
