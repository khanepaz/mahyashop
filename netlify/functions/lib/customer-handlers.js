// ============================================================
// HamedShop - Customer Bot (user-facing)
// Order lookup, details, payment via Bale Invoice
// ============================================================

const {
  sendMessage,
  sendCustomerMenu,
  sendPhoto,
  sendInvoice,
  answerCallbackQuery,
  answerPreCheckoutQuery,
  inlineKeyboard,
  SITE_URL
} = require("./bale");
const {
  getOrdersFile,
  updateOrderStatus,
  linkOrderToChat,
  markOrderPaid,
  getOrderById
} = require("./orders");
const { formatPrice, safeText, escapeMd, nowISO } = require("./utils");
const { ORDER_STATUS_LABELS } = require("./config");
const { notifyOrderPaid } = require("./notifications");

function money(n) {
  return formatPrice(n);
}

function statusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || "—";
}

function absoluteImageUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = SITE_URL.replace(/\/$/, "");
  const p = String(path).replace(/^\//, "");
  return `${base}/${p}`;
}

function orderSummaryText(order) {
  const lines = [];
  lines.push(`🧾 *سفارش ${escapeMd(order.id)}*`);
  lines.push(`وضعیت: ${statusLabel(order.status)}`);
  if (order.paymentStatus === "paid") {
    lines.push("💳 پرداخت: *انجام شده*");
  } else if (["pending", "awaiting_payment"].includes(order.status)) {
    lines.push("💳 پرداخت: در انتظار");
  }
  lines.push("");

  for (const item of order.items || []) {
    const name = escapeMd(item.name || "محصول");
    const varName = item.variantName ? ` (${escapeMd(item.variantName)})` : "";
    lines.push(
      `• ${name}${varName}\n  ${item.quantity} × ${money(item.unitPrice)} = *${money(item.total)}*`
    );
  }

  lines.push("");
  lines.push(`جمع اقلام: ${money(order.subtotal)}`);
  if (order.discount > 0) {
    lines.push(`تخفیف: −${money(order.discount)}`);
  }
  if (order.shipping > 0) {
    lines.push(`ارسال: ${money(order.shipping)}`);
  }
  lines.push(`*مبلغ قابل پرداخت: ${money(order.total)}*`);

  const c = order.customer || {};
  if (c.name || c.phone || c.address) {
    lines.push("");
    lines.push("👤 *گیرنده*");
    if (c.name) lines.push(escapeMd(c.name));
    if (c.phone) lines.push(escapeMd(c.phone));
    if (c.address) lines.push(escapeMd(c.address));
  }
  if (order.note) {
    lines.push("");
    lines.push(`📝 ${escapeMd(order.note)}`);
  }

  return lines.join("\n");
}

function orderActionKeyboard(order) {
  const rows = [];
  const canPay =
    order.paymentStatus !== "paid" &&
    !["cancelled", "returned", "delivered"].includes(order.status);

  if (canPay && order.total > 0) {
    rows.push([
      { text: "💳 پرداخت آنلاین", callback_data: `c:pay:${order.id}` }
    ]);
  }

  rows.push([
    { text: "🔄 به‌روزرسانی وضعیت", callback_data: `c:order:${order.id}` }
  ]);
  rows.push([
    { text: "🌐 فروشگاه", url: SITE_URL }
  ]);

  return inlineKeyboard(rows);
}

async function showOrderToCustomer(chatId, order) {
  if (!order) {
    return sendMessage(
      chatId,
      "❌ سفارشی با این کد پیدا نشد.\nکد را دوباره بررسی کنید یا از «پیگیری سفارش» استفاده کنید.",
      null,
      "customer"
    );
  }

  try {
    await linkOrderToChat(order.id, chatId);
  } catch (e) {
    console.warn("linkOrderToChat:", e.message);
  }

  const text = orderSummaryText(order);
  const kb = orderActionKeyboard(order);

  const firstImage =
    (order.items || []).map((i) => i.image).find(Boolean) || null;
  const photo = absoluteImageUrl(firstImage);

  if (photo) {
    try {
      await sendPhoto(chatId, photo, text, kb, "customer");
      return;
    } catch (e) {
      console.warn("sendPhoto failed, fallback to text:", e.message);
    }
  }

  return sendMessage(chatId, text, kb, "customer");
}

async function handleStartPayload(chatId, payload) {
  const raw = safeText(payload);

  let orderId = null;
  if (raw.startsWith("order_")) {
    orderId = raw.slice("order_".length);
  } else if (raw.startsWith("ORD")) {
    orderId = raw;
  }

  if (orderId) {
    const order = await getOrderById(orderId);
    await sendMessage(
      chatId,
      "⏳ در حال دریافت اطلاعات سفارش...",
      null,
      "customer"
    );
    return showOrderToCustomer(chatId, order);
  }

  return sendCustomerMenu(chatId);
}

async function showMyOrders(chatId) {
  const file = await getOrdersFile();
  const mine = (file.data || [])
    .filter(
      (o) =>
        String(o.baleChatId) === String(chatId) ||
        (o.customer && String(o.customer.baleChatId) === String(chatId))
    )
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, 10);

  if (!mine.length) {
    return sendMessage(
      chatId,
      "هنوز سفارشی به این حساب وصل نشده.\n\n" +
        "اگر از سایت سفارش داده‌اید، از لینک بعد از ثبت سفارش وارد شوید " +
        "یا با «🔍 پیگیری سفارش» کد سفارش را بفرستید.",
      null,
      "customer"
    );
  }

  const rows = mine.map((o) => [
    {
      text: `${statusLabel(o.status)} | ${o.id} | ${money(o.total)}`,
      callback_data: `c:order:${o.id}`
    }
  ]);

  return sendMessage(
    chatId,
    `🧾 *سفارش‌های شما* (${mine.length})\nیکی را انتخاب کنید:`,
    inlineKeyboard(rows),
    "customer"
  );
}

async function startOrderLookup(chatId) {
  return sendMessage(
    chatId,
    "🔍 *پیگیری سفارش*\n\nکد سفارش را بفرستید.\nمثال: `ORD_xxxx`\n\n(کد را در پیام تأیید سایت می‌بینید)",
    null,
    "customer"
  );
}

async function tryResolveOrderIdText(chatId, text) {
  const t = safeText(text);
  if (!t) return false;

  let id = t;
  if (t.startsWith("order_")) id = t.slice(6);
  if (!id.startsWith("ORD") && !/^ORD[_-]/i.test(id)) {
    if (t.length < 8) return false;
  }

  const order = await getOrderById(id);
  if (!order) {
    const file = await getOrdersFile();
    const found = (file.data || []).find(
      (o) => String(o.id).toLowerCase() === id.toLowerCase()
    );
    if (!found) {
      await sendMessage(
        chatId,
        "❌ سفارشی با این کد پیدا نشد. دوباره تلاش کنید.",
        null,
        "customer"
      );
      return true;
    }
    await showOrderToCustomer(chatId, found);
    return true;
  }

  await showOrderToCustomer(chatId, order);
  return true;
}

async function sendPaymentInvoice(chatId, orderId) {
  const order = await getOrderById(orderId);
  if (!order) {
    return sendMessage(chatId, "❌ سفارش پیدا نشد.", null, "customer");
  }

  if (order.paymentStatus === "paid") {
    return sendMessage(
      chatId,
      "✅ این سفارش قبلاً پرداخت شده است.",
      orderActionKeyboard(order),
      "customer"
    );
  }

  if (["cancelled", "returned"].includes(order.status)) {
    return sendMessage(
      chatId,
      "این سفارش قابل پرداخت نیست.",
      null,
      "customer"
    );
  }

  if (!(order.total > 0)) {
    return sendMessage(chatId, "مبلغ سفارش صفر است.", null, "customer");
  }

  const amountRials = Math.round(Number(order.total) * 10);

  const title = `سفارش ${order.id}`.slice(0, 32);
  const description = [
    `پرداخت سفارش ${order.id}`,
    order.customer?.name ? `گیرنده: ${order.customer.name}` : "",
    `${(order.items || []).length} قلم`
  ]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 255);

  const photo =
    absoluteImageUrl(
      (order.items || []).map((i) => i.image).find(Boolean)
    ) || undefined;

  try {
    await sendInvoice(
      chatId,
      {
        title,
        description,
        payload: JSON.stringify({
          orderId: order.id,
          type: "order_payment"
        }),
        prices: [{ label: "مبلغ سفارش", amount: amountRials }],
        photoUrl: photo
      },
      "customer"
    );
  } catch (err) {
    console.error("sendInvoice error:", err);
    return sendMessage(
      chatId,
      "❌ ارسال فاکتور پرداخت ممکن نشد.\n" +
        "پرداخت درون‌برنامه‌ای را از پنل بله برای ربات فعال کنید.\n\n" +
        `جزئیات: ${escapeMd(err.message || String(err))}`,
      orderActionKeyboard(order),
      "customer"
    );
  }
}

async function handleCustomerMessage(message) {
  const chatId = message?.chat?.id;
  if (chatId === undefined || chatId === null) return;

  if (message.successful_payment) {
    return handleSuccessfulPayment(chatId, message.successful_payment);
  }

  const text = safeText(message.text);

  if (text === "/start" || text.startsWith("/start ")) {
    const payload = text.length > 6 ? text.slice(6).trim() : "";
    return handleStartPayload(chatId, payload);
  }

  if (text === "🧾 سفارش‌های من" || text === "/orders") {
    return showMyOrders(chatId);
  }

  if (text === "🔍 پیگیری سفارش" || text === "/track") {
    return startOrderLookup(chatId);
  }

  if (text === "🌐 فروشگاه" || text === "/shop") {
    return sendMessage(
      chatId,
      `🌐 فروشگاه آنلاین:\n${SITE_URL}\n\nبعد از ثبت سفارش، از دکمه باز کردن ربات برای پرداخت استفاده کنید.`,
      inlineKeyboard([[{ text: "باز کردن فروشگاه", url: SITE_URL }]]),
      "customer"
    );
  }

  if (text === "📞 پشتیبانی" || text === "/support") {
    return sendMessage(
      chatId,
      "📞 *پشتیبانی*\n\nسوالی دارید؟ همین‌جا پیام بگذارید.\nبرای پیگیری سفارش از «🔍 پیگیری سفارش» استفاده کنید.",
      null,
      "customer"
    );
  }

  if (
    text.startsWith("ORD") ||
    text.startsWith("order_") ||
    /^[A-Za-z0-9_-]{10,}$/.test(text)
  ) {
    const resolved = await tryResolveOrderIdText(chatId, text);
    if (resolved) return;
  }

  return sendCustomerMenu(chatId);
}

async function handleCustomerCallback(callbackQuery) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = safeText(callbackQuery.data);

  await answerCallbackQuery(callbackQuery.id, "", "customer");

  if (data.startsWith("c:order:")) {
    const orderId = data.slice("c:order:".length);
    const order = await getOrderById(orderId);
    return showOrderToCustomer(chatId, order);
  }

  if (data.startsWith("c:pay:")) {
    const orderId = data.slice("c:pay:".length);
    return sendPaymentInvoice(chatId, orderId);
  }

  if (data === "c:menu") {
    return sendCustomerMenu(chatId);
  }

  return sendMessage(chatId, "دستور نامشخص است.", null, "customer");
}

async function handlePreCheckout(preCheckoutQuery) {
  try {
    let payload = {};
    try {
      payload = JSON.parse(preCheckoutQuery.invoice_payload || "{}");
    } catch {
      payload = {};
    }

    const orderId = payload.orderId;
    if (orderId) {
      const order = await getOrderById(orderId);
      if (!order) {
        return answerPreCheckoutQuery(
          preCheckoutQuery.id,
          false,
          "سفارش پیدا نشد",
          "customer"
        );
      }
      if (order.paymentStatus === "paid") {
        return answerPreCheckoutQuery(
          preCheckoutQuery.id,
          false,
          "این سفارش قبلاً پرداخت شده",
          "customer"
        );
      }
      if (["cancelled", "returned"].includes(order.status)) {
        return answerPreCheckoutQuery(
          preCheckoutQuery.id,
          false,
          "سفارش قابل پرداخت نیست",
          "customer"
        );
      }
    }

    return answerPreCheckoutQuery(preCheckoutQuery.id, true, "", "customer");
  } catch (err) {
    console.error("pre_checkout error:", err);
    return answerPreCheckoutQuery(
      preCheckoutQuery.id,
      false,
      "خطای موقت — دوباره تلاش کنید",
      "customer"
    );
  }
}

async function handleSuccessfulPayment(chatId, successfulPayment) {
  let payload = {};
  try {
    payload = JSON.parse(successfulPayment.invoice_payload || "{}");
  } catch {
    payload = {};
  }

  const orderId = payload.orderId;
  if (!orderId) {
    return sendMessage(
      chatId,
      "✅ پرداخت دریافت شد، اما کد سفارش در فاکتور نبود. با پشتیبانی تماس بگیرید.",
      null,
      "customer"
    );
  }

  try {
    const order = await markOrderPaid(orderId, {
      chatId,
      providerPaymentChargeId: successfulPayment.provider_payment_charge_id,
      telegramPaymentChargeId: successfulPayment.telegram_payment_charge_id,
      totalAmount: successfulPayment.total_amount,
      currency: successfulPayment.currency,
      paidAt: nowISO()
    });

    try {
      await notifyOrderPaid(order, {
        providerPaymentChargeId: successfulPayment.provider_payment_charge_id,
        telegramPaymentChargeId: successfulPayment.telegram_payment_charge_id
      });
    } catch (e) {
      console.warn("notifyOrderPaid:", e.message);
    }

    return sendMessage(
      chatId,
      `✅ *پرداخت موفق*\n\nسفارش *${escapeMd(order.id)}* ثبت و پرداخت شد.\n` +
        `مبلغ: ${money(order.total)}\n\n` +
        `وضعیت: ${statusLabel(order.status)}\n\n` +
        "از خرید شما متشکریم 🌿",
      orderActionKeyboard(order),
      "customer"
    );
  } catch (err) {
    console.error("markOrderPaid:", err);
    return sendMessage(
      chatId,
      "✅ پرداخت انجام شد اما به‌روزرسانی سفارش با خطا مواجه شد. کد سفارش را برای پشتیبانی بفرستید:\n" +
        escapeMd(orderId),
      null,
      "customer"
    );
  }
}

module.exports = {
  handleCustomerMessage,
  handleCustomerCallback,
  handlePreCheckout,
  handleSuccessfulPayment,
  showOrderToCustomer,
  handleStartPayload
};
