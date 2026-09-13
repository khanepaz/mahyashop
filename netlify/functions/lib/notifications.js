// ============================================================
// MahyaShop - Admin notifications (Bale)
// Resolves admin chat IDs from env + settings.json
// ============================================================

const { sendMessage, inlineKeyboard } = require("./bale");
const { readJsonFile, writeJsonFile } = require("./github");
const { JSON_DEFAULTS } = require("./config");
const { formatPrice, escapeMd, safeText, nowISO } = require("./utils");

async function getSettingsFile() {
  return readJsonFile("data/settings.json", JSON_DEFAULTS["data/settings.json"]);
}

function envAdminIds() {
  const raw = safeText(process.env.ADMIN_CHAT_ID || process.env.ADMIN_CHAT_IDS || "");
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getAdminChatIds() {
  const ids = new Set(envAdminIds());
  try {
    const file = await getSettingsFile();
    const s = file.data || {};
    if (s.adminChatId) ids.add(String(s.adminChatId));
    if (Array.isArray(s.adminChatIds)) {
      s.adminChatIds.forEach((id) => ids.add(String(id)));
    }
  } catch (e) {
    console.warn("getAdminChatIds settings:", e.message);
  }
  return [...ids];
}

/** Remember admin chat when they use the admin bot (no need to know the ID manually). */
async function registerAdminChat(chatId) {
  if (chatId === undefined || chatId === null) return;
  const id = String(chatId);
  try {
    const file = await getSettingsFile();
    const s = { ...(file.data || {}) };
    const list = Array.isArray(s.adminChatIds)
      ? s.adminChatIds.map(String)
      : [];
    let changed = false;
    if (!list.includes(id)) {
      list.push(id);
      s.adminChatIds = list;
      changed = true;
    }
    if (String(s.adminChatId || "") !== id) {
      s.adminChatId = id;
      changed = true;
    }
    if (!changed) return;
    s.updatedAt = nowISO();
    await writeJsonFile(
      "data/settings.json",
      s,
      "Register admin chat " + id,
      file.sha
    );
  } catch (e) {
    console.warn("registerAdminChat:", e.message);
  }
}

async function notifyAdmins(text, replyMarkup = null) {
  const ids = await getAdminChatIds();
  if (!ids.length) {
    console.warn(
      "notifyAdmins: no ADMIN_CHAT_ID / settings.adminChatId — open admin bot once so ID is saved"
    );
    return { ok: false, reason: "no_admin" };
  }
  const results = [];
  for (const chatId of ids) {
    try {
      await sendMessage(chatId, text, replyMarkup, "admin");
      results.push({ chatId, ok: true });
    } catch (e) {
      console.error("notifyAdmins failed", chatId, e.message);
      results.push({ chatId, ok: false, error: e.message });
    }
  }
  return { ok: results.some((r) => r.ok), results };
}

function orderItemsLines(order) {
  return (order.items || [])
    .map((i) => {
      const v = i.variantName ? " (" + escapeMd(i.variantName) + ")" : "";
      return "• " + escapeMd(i.name) + v + " × " + i.quantity + " = *" + formatPrice(i.total) + "*";
    })
    .join("\n");
}

function customerBlock(order) {
  const c = order.customer || {};
  const lines = [];
  if (c.name) lines.push("نام: " + escapeMd(c.name));
  if (c.phone) lines.push("موبایل: " + escapeMd(c.phone));
  if (c.address) lines.push("آدرس: " + escapeMd(c.address));
  if (order.note) lines.push("توضیح: " + escapeMd(order.note));
  if (order.baleChatId) lines.push("چت بله: " + String(order.baleChatId));
  return lines.length ? lines.join("\n") : "—";
}

async function notifyNewOrder(order) {
  if (!order) return;
  const text =
    "🛒 *سفارش جدید ثبت شد*\n\n" +
    "کد: *" + escapeMd(order.id) + "*\n" +
    "وضعیت: در انتظار پرداخت\n" +
    "مبلغ: *" + formatPrice(order.total) + "*\n\n" +
    "*اقلام:*\n" + orderItemsLines(order) + "\n\n" +
    "*مشتری:*\n" + customerBlock(order);

  return notifyAdmins(
    text,
    inlineKeyboard([
      [{ text: "📋 جزئیات سفارش", callback_data: "order:detail:" + order.id }],
      [{ text: "🛒 همه سفارش‌ها", callback_data: "orders.list" }]
    ])
  );
}

async function notifyOrderPaid(order, paymentMeta = {}) {
  if (!order) return;
  const charge =
    paymentMeta.providerPaymentChargeId ||
    paymentMeta.telegramPaymentChargeId ||
    (order.payment &&
      (order.payment.providerPaymentChargeId ||
        order.payment.telegramPaymentChargeId)) ||
    "—";

  const text =
    "✅ *پرداخت موفق*\n\n" +
    "کد سفارش: *" + escapeMd(order.id) + "*\n" +
    "مبلغ: *" + formatPrice(order.total) + "*\n" +
    "وضعیت: تأیید شده / پرداخت شده\n" +
    "شناسه پرداخت: " + escapeMd(String(charge)) + "\n\n" +
    "*اقلام:*\n" + orderItemsLines(order) + "\n\n" +
    "*مشتری:*\n" + customerBlock(order);

  return notifyAdmins(
    text,
    inlineKeyboard([
      [{ text: "📋 مدیریت سفارش", callback_data: "order:detail:" + order.id }],
      [
        {
          text: "📦 آماده‌سازی",
          callback_data: "order:status:" + order.id + ":packing"
        }
      ]
    ])
  );
}

module.exports = {
  getAdminChatIds,
  registerAdminChat,
  notifyAdmins,
  notifyNewOrder,
  notifyOrderPaid
};
