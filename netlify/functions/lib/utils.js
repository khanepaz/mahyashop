// ============================================================
// HamedShop - Shared Utilities
// ============================================================

function nowISO() {
  return new Date().toISOString();
}

function generateId(prefix = "ID") {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).substring(2, 8)
  );
}

function generateProductId() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");

  return (
    "P" +
    String(d.getFullYear()).slice(-2) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds()) +
    Math.floor(Math.random() * 100)
      .toString()
      .padStart(2, "0")
  );
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value) {
  return String(value ?? "").trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeMd(text) {
  return String(text ?? "")
    .replace(/([_*`\[\]])/g, "\\$1");
}

function formatPrice(amount, currency = "IRR") {
  const n = safeNumber(amount);
  const formatted = Math.round(n).toLocaleString("fa-IR");
  return currency === "IRR" ? `${formatted} تومان` : `${formatted} ${currency}`;
}

function jsonResponse(statusCode, data) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
    },
    body: JSON.stringify(data)
  };
}

function parseJsonBody(event) {
  if (!event || !event.body) return {};
  if (typeof event.body === "object") return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function getAdminSecret() {
  return (
    safeText(process.env.ADMIN_PASSWORD) ||
    safeText(process.env.ADMIN_API_KEY) ||
    "admin123"
  );
}

function checkAdminPassword(password) {
  return safeText(password) === getAdminSecret();
}

function isAdminRequest(chatId, event) {
  const adminChat = safeText(process.env.ADMIN_CHAT_ID);
  const apiKey =
    event?.headers?.["x-admin-key"] ||
    event?.headers?.["X-Admin-Key"];

  if (apiKey && apiKey === getAdminSecret()) {
    return true;
  }

  if (adminChat && chatId !== undefined && chatId !== null) {
    return String(chatId) === adminChat;
  }

  if (process.env.ADMIN_API_KEY || process.env.ADMIN_PASSWORD) {
    if (chatId !== undefined && chatId !== null && !adminChat) {
      return true;
    }
    return false;
  }

  return true;
}

function requireAdminApi(event) {
  const apiKey =
    event?.headers?.["x-admin-key"] ||
    event?.headers?.["X-Admin-Key"];
  if (apiKey && apiKey === getAdminSecret()) return true;
  if (!apiKey) {
    const err = new Error("Unauthorized — وارد پنل شوید");
    err.statusCode = 401;
    throw err;
  }
  if (apiKey !== getAdminSecret()) {
    const err = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
  return true;
}

module.exports = {
  nowISO,
  generateId,
  generateProductId,
  safeNumber,
  safeText,
  safeArray,
  escapeMd,
  formatPrice,
  jsonResponse,
  parseJsonBody,
  isAdminRequest,
  getAdminSecret,
  checkAdminPassword,
  requireAdminApi
};
