// ============================================================
// HamedShop API v3 — Netlify Function Entry Point
// ============================================================

const { API_VERSION, SITE_URL } = require("./lib/config");
const { jsonResponse, parseJsonBody } = require("./lib/utils");
const { handleMessage, handleCallbackQuery } = require("./lib/handlers");
const { handleApiAction } = require("./lib/api-actions");

exports.handler = async function (event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, { ok: true });
    }

    if (event.httpMethod === "GET") {
      return jsonResponse(200, {
        ok: true,
        service: "HamedShop API",
        version: API_VERSION,
        site: SITE_URL
      });
    }

    if (event.httpMethod !== "POST") {
      return jsonResponse(405, {
        ok: false,
        error: "Method not allowed"
      });
    }

    const body = parseJsonBody(event);

    if (body.action) {
      const result = await handleApiAction(body.action, body, event);
      return jsonResponse(200, { ok: true, result });
    }

    if (body.callback_query) {
      await handleCallbackQuery(body.callback_query, event);
      return jsonResponse(200, { ok: true });
    }

    if (body.message) {
      await handleMessage(body.message, event);
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(200, { ok: true, ignored: true });
  } catch (error) {
    console.error("HamedShop API ERROR:", error);
    const status = error.statusCode || 500;
    return jsonResponse(status, {
      ok: false,
      error: error.message || String(error)
    });
  }
};
