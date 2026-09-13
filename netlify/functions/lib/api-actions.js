// ============================================================
// HamedShop - REST-like API actions (for website / external)
// ============================================================

const {
  getProductsFile,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductPricing,
  normalizeProduct
} = require("./products");
const {
  getCategoriesFile,
  createCategory,
  updateCategory,
  deleteCategory
} = require("./categories");
const {
  getBadgesFile,
  createBadge,
  updateBadge,
  deleteBadge
} = require("./badges");
const { getOrdersFile, createOrder, updateOrderStatus } = require("./orders");
const { readJsonFile, writeJsonFile } = require("./github");
const { JSON_DEFAULTS } = require("./config");
const { nowISO, safeText, safeNumber } = require("./utils");
const { calculatePricing } = require("./pricing");
const { notifyNewOrder } = require("./notifications");

async function handleApiAction(action, body, event) {
  switch (action) {
    // ---------- Products ----------
    case "products.list": {
      const file = await getProductsFile();
      return file.data.map(normalizeProduct);
    }

    case "products.get": {
      const product = await getProduct(body.id || body.productId);
      if (!product) throw new Error("Product not found");
      return product;
    }

    case "products.create":
      return createProduct(body.product || body);

    case "products.update":
      return updateProduct(body.id || body.productId, body.changes || body);

    case "products.delete":
      return deleteProduct(body.id || body.productId);

    case "products.pricing.update": {
      return updateProductPricing(body.id || body.productId, {
        compareAtPrice: body.compareAtPrice,
        discountType: body.discountType || "none",
        discountValue: body.discountValue || 0
      });
    }

    case "products.stock.update": {
      const productId = body.id || body.productId;
      const stock = Math.max(0, safeNumber(body.stock));
      return updateProduct(productId, {
        stock,
        totalStock: stock
      });
    }

    case "products.status.update": {
      return updateProduct(body.id || body.productId, {
        active: body.active !== false
      });
    }

    // ---------- Categories ----------
    case "categories.list": {
      const file = await getCategoriesFile();
      return file.data;
    }

    case "categories.create":
      return createCategory(body.category || body);

    case "categories.update":
      return updateCategory(
        body.id || body.categoryId,
        body.changes || body
      );

    case "categories.delete":
      return deleteCategory(body.id || body.categoryId);

    // ---------- Badges ----------
    case "badges.list": {
      const file = await getBadgesFile();
      return file.data;
    }

    case "badges.create":
      return createBadge(body.badge || body);

    case "badges.update":
      return updateBadge(body.id || body.badgeId, body.changes || body);

    case "badges.delete":
      return deleteBadge(body.id || body.badgeId);

    // ---------- Variants / Inventory ----------
    case "variants.list": {
      const file = await readJsonFile("data/variants.json", []);
      return file.data;
    }

    case "inventory.list": {
      const file = await readJsonFile("data/inventory.json", []);
      return file.data;
    }

    // ---------- Orders ----------
    case "orders.list": {
      const file = await getOrdersFile();
      return file.data;
    }

    case "orders.get": {
      const file = await getOrdersFile();
      const order = file.data.find(
        (o) => o.id === (body.id || body.orderId)
      );
      if (!order) throw new Error("Order not found");
      return order;
    }

    case "orders.create": {
      const orderBody = body.payload && typeof body.payload === "object"
        ? { ...body.payload, ...body }
        : body;
      if (body.payload && typeof body.payload === "object") {
        if (body.payload.customer) orderBody.customer = body.payload.customer;
        if (body.payload.items) orderBody.items = body.payload.items;
        if (body.payload.note != null) orderBody.note = body.payload.note;
      }
      const order = await createOrder(orderBody);
      try {
        await notifyNewOrder(order);
      } catch (e) {
        console.warn("notifyNewOrder:", e.message);
      }
      return order;
    }

    case "orders.status.update":
      return updateOrderStatus(
        body.id || body.orderId,
        body.status
      );

    // ---------- Customers ----------
    case "customers.list": {
      const file = await readJsonFile("data/customers.json", []);
      return file.data;
    }

    // ---------- Discounts ----------
    case "discounts.list": {
      const file = await readJsonFile("data/discounts.json", []);
      return file.data;
    }

    case "discounts.validate": {
      const file = await readJsonFile("data/discounts.json", []);
      const code = safeText(body.code).toLowerCase();
      return (
        file.data.find(
          (d) =>
            safeText(d.code).toLowerCase() === code &&
            d.active !== false
        ) || null
      );
    }

    // ---------- Settings ----------
    case "settings.get": {
      const file = await readJsonFile(
        "data/settings.json",
        JSON_DEFAULTS["data/settings.json"]
      );
      return file.data;
    }

    case "settings.update": {
      const file = await readJsonFile(
        "data/settings.json",
        JSON_DEFAULTS["data/settings.json"]
      );

      const settings = {
        ...file.data,
        ...(body.settings || body),
        updatedAt: nowISO()
      };

      await writeJsonFile(
        "data/settings.json",
        settings,
        "Update settings",
        file.sha
      );

      return settings;
    }

    // ---------- Pricing helper (stateless) ----------
    case "pricing.calculate":
      return calculatePricing(body);

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

module.exports = { handleApiAction };
