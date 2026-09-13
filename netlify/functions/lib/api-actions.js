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
const { getOrdersFile, createOrder, updateOrderStatus, markOrderPaid } = require("./orders");
const { readJsonFile, writeJsonFile, writeBinaryFile } = require("./github");
const { JSON_DEFAULTS } = require("./config");
const { nowISO, safeText, safeNumber, checkAdminPassword, getAdminSecret, requireAdminApi } = require("./utils");
const { calculatePricing } = require("./pricing");
const { notifyNewOrder } = require("./notifications");

async function handleApiAction(action, body, event) {
  const writeActions = new Set([
    "products.create", "products.update", "products.delete",
    "products.pricing.update", "products.stock.update", "products.status.update",
    "categories.create", "categories.update", "categories.delete",
    "badges.create", "badges.update", "badges.delete",
    "orders.status.update", "orders.payment.mark",
    "discounts.create", "discounts.update", "discounts.delete",
    "settings.update", "banners.save", "media.upload"
  ]);
  if (writeActions.has(action)) {
    requireAdminApi(event);
  }

  switch (action) {
    case "admin.login": {
      const password = safeText(body.password);
      if (!checkAdminPassword(password)) {
        const err = new Error("رمز عبور نادرست است");
        err.statusCode = 401;
        throw err;
      }
      return {
        ok: true,
        token: getAdminSecret(),
        shopName: "MahyaShop"
      };
    }

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

    case "products.pricing.update":
      return updateProductPricing(
        body.id || body.productId,
        body.pricing || body
      );

    case "categories.list": {
      const file = await getCategoriesFile();
      return file.data;
    }

    case "categories.create":
      return createCategory(body.category || body);

    case "categories.update":
      return updateCategory(body.id || body.categoryId, body.changes || body);

    case "categories.delete":
      return deleteCategory(body.id || body.categoryId);

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

    case "inventory.list": {
      const file = await readJsonFile("data/inventory.json", []);
      return file.data;
    }

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

    case "orders.payment.mark":
      return markOrderPaid(body.id || body.orderId, body.payment || body.meta || {});

    case "customers.list": {
      const file = await readJsonFile("data/customers.json", []);
      return file.data;
    }

    case "discounts.list": {
      const file = await readJsonFile("data/discounts.json", []);
      return file.data;
    }

    case "discounts.create": {
      const file = await readJsonFile("data/discounts.json", []);
      const code = safeText(body.code || (body.discount && body.discount.code));
      if (!code) throw new Error("کد تخفیف الزامی است");
      const exists = file.data.find(
        (d) => safeText(d.code).toLowerCase() === code.toLowerCase()
      );
      if (exists) throw new Error("این کد قبلاً وجود دارد");
      const item = {
        id: "D_" + Date.now().toString(36),
        code,
        type: body.type === "amount" ? "amount" : "percent",
        value: safeNumber(body.value),
        active: body.active !== false,
        createdAt: nowISO()
      };
      file.data.push(item);
      await writeJsonFile("data/discounts.json", file.data, "Add discount", file.sha);
      return item;
    }

    case "discounts.update": {
      const file = await readJsonFile("data/discounts.json", []);
      const id = body.id || body.discountId;
      const idx = file.data.findIndex(
        (d) => d.id === id || d.code === id
      );
      if (idx === -1) throw new Error("کد تخفیف پیدا نشد");
      file.data[idx] = { ...file.data[idx], ...(body.changes || body), id: file.data[idx].id };
      await writeJsonFile("data/discounts.json", file.data, "Update discount", file.sha);
      return file.data[idx];
    }

    case "discounts.delete": {
      const file = await readJsonFile("data/discounts.json", []);
      const id = body.id || body.discountId;
      const next = file.data.filter((d) => d.id !== id && d.code !== id);
      await writeJsonFile("data/discounts.json", next, "Delete discount", file.sha);
      return { ok: true };
    }

    case "settings.get": {
      const file = await readJsonFile("data/settings.json", JSON_DEFAULTS["data/settings.json"] || {});
      return file.data;
    }

    case "settings.update": {
      const file = await readJsonFile("data/settings.json", {});
      const next = { ...file.data, ...(body.settings || body) };
      await writeJsonFile("data/settings.json", next, "Update settings", file.sha);
      return next;
    }

    case "banners.list": {
      const file = await readJsonFile("data/banners.json", []);
      return (file.data || []).filter((b) => b && b.active !== false);
    }

    case "banners.all": {
      const file = await readJsonFile("data/banners.json", []);
      return file.data || [];
    }

    case "banners.save": {
      const list = Array.isArray(body.banners) ? body.banners : [];
      const file = await readJsonFile("data/banners.json", []);
      await writeJsonFile("data/banners.json", list, "Save banners", file.sha);
      return list;
    }

    case "media.upload": {
      const base64 = body.base64 || body.content;
      if (!base64) throw new Error("base64 required");
      let filename = safeText(body.filename) || `img_${Date.now()}.jpg`;
      filename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      if (!filename.includes(".")) filename += ".jpg";
      const path = filename.startsWith("images/") ? filename : `images/${filename}`;
      const buffer = Buffer.from(String(base64).replace(/^data:image\/\w+;base64,/, ""), "base64");
      await writeBinaryFile(path, buffer, `Upload ${path}`);
      return { path, url: path };
    }

    default:
      throw new Error("Unknown action: " + action);
  }
}

module.exports = { handleApiAction };
