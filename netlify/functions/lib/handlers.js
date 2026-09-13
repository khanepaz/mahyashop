// ============================================================
// HamedShop - Message & Callback Handlers
// ============================================================

const {
  sendMessage,
  sendMainMenu,
  answerCallbackQuery,
  SITE_URL
} = require("./bale");
const { isAdminRequest, safeText } = require("./utils");
const { registerAdminChat } = require("./notifications");
const { getDraft, saveDraft, deleteDraft } = require("./drafts");
const {
  startProductWizard,
  wizardNext,
  finalizeProduct,
  handleWizardText,
  handlePhoto
} = require("./wizard");
const {
  showProducts,
  showProductManagement,
  showCategories,
  showCategoryDetail,
  showBadges,
  showInventory,
  showOrders,
  showOrderDetail,
  showCustomers,
  showDiscounts,
  showSettings
} = require("./ui");
const {
  updateProduct,
  deleteProduct,
  getProduct
} = require("./products");
const { updateOrderStatus } = require("./orders");
const { deleteCategory } = require("./categories");
const { deleteBadge } = require("./badges");

async function handleMainMenu(chatId, message) {
  const text = safeText(message.text);

  switch (text) {
    case "➕ افزودن محصول":
      await startProductWizard(chatId);
      return true;
    case "📦 مشاهده محصولات":
      await showProducts(chatId);
      return true;
    case "📂 دسته‌بندی‌ها":
      await showCategories(chatId);
      return true;
    case "📊 موجودی":
      await showInventory(chatId);
      return true;
    case "🏷️ گزینه‌های ویژه":
      await showBadges(chatId);
      return true;
    case "🛒 سفارش‌ها":
      await showOrders(chatId);
      return true;
    case "👥 مشتریان":
      await showCustomers(chatId);
      return true;
    case "🏷️ تخفیف‌ها":
      await showDiscounts(chatId);
      return true;
    case "⚙️ تنظیمات":
      await showSettings(chatId);
      return true;
    case "🌐 مشاهده سایت":
      await sendMessage(chatId, `🌐 آدرس فروشگاه:\n${SITE_URL}`);
      return true;
    default:
      return false;
  }
}

async function handleMessage(message, event) {
  const chatId = message?.chat?.id;
  if (chatId === undefined || chatId === null) return;

  if (!isAdminRequest(chatId, event)) {
    return sendMessage(chatId, "⛔ شما دسترسی مدیریت ندارید.");
  }

  try { await registerAdminChat(chatId); } catch (e) { console.warn(e.message); }

  if (await handlePhoto(chatId, message)) return;
  if (await handleWizardText(chatId, message)) return;

  const handled = await handleMainMenu(chatId, message);
  if (handled) return;

  return sendMainMenu(chatId);
}

async function handleCallbackQuery(callbackQuery, event) {
  const chatId = callbackQuery.message?.chat?.id;
  const data = safeText(callbackQuery.data);

  await answerCallbackQuery(callbackQuery.id);

  if (!isAdminRequest(chatId, event)) {
    return sendMessage(chatId, "⛔ دسترسی ندارید.");
  }

  try { await registerAdminChat(chatId); } catch (e) { console.warn(e.message); }

  if (data === "menu") return sendMainMenu(chatId);
  if (data === "products.list") return showProducts(chatId);
  if (data === "categories.list") return showCategories(chatId);
  if (data === "orders.list") return showOrders(chatId);

  if (data === "draft:cancel") {
    await deleteDraft(chatId);
    return sendMessage(chatId, "❌ عملیات لغو شد.").then(() => sendMainMenu(chatId));
  }

  if (data === "draft:photos_done") {
    const draft = await getDraft(chatId);
    if (!draft) return sendMessage(chatId, "پیش‌نویس پیدا نشد.");
    if (!draft.images.length) return sendMessage(chatId, "حداقل یک عکس ارسال کنید.");
    draft.step = "category";
    await saveDraft(chatId, draft);
    return wizardNext(chatId, draft);
  }

  if (data === "draft:skip_description") {
    const draft = await getDraft(chatId);
    if (!draft) return;
    draft.description = "";
    draft.step = "price";
    await saveDraft(chatId, draft);
    return wizardNext(chatId, draft);
  }

  if (data === "draft:featured_yes" || data === "draft:featured_no") {
    const draft = await getDraft(chatId);
    if (!draft) return;
    draft.featured = data === "draft:featured_yes";
    draft.step = "tags";
    await saveDraft(chatId, draft);
    return wizardNext(chatId, draft);
  }

  if (data === "draft:confirm") {
    try {
      const created = await finalizeProduct(chatId);
      await sendMessage(
        chatId,
        `✅ محصول *${created.name}* با موفقیت ثبت شد.\n` +
          `قیمت نهایی: ${created.finalPrice.toLocaleString("fa-IR")} تومان`
      );
      return showProductManagement(chatId, created.id);
    } catch (err) {
      return sendMessage(chatId, "❌ خطا در ثبت: " + err.message);
    }
  }

  if (data === "draft:edit") {
    return sendMessage(
      chatId,
      "برای ویرایش، محصول را بعد از ثبت از لیست محصولات انتخاب کنید.\n" +
        "یا عملیات را لغو کرده و دوباره شروع کنید."
    );
  }

  if (data.startsWith("category:") && !data.includes("detail") && !data.includes("edit") && !data.includes("delete") && data !== "category:new") {
    const categoryId = data.substring("category:".length);
    const { getCategoriesFile } = require("./categories");
    const file = await getCategoriesFile();
    const category = file.data.find((c) => String(c.id) === String(categoryId));

    if (!category) return sendMessage(chatId, "❌ دسته‌بندی پیدا نشد.");

    const draft = await getDraft(chatId);
    if (!draft) return sendMessage(chatId, "ابتدا ثبت محصول را شروع کنید.");

    if (draft.step === "edit_category") {
      await updateProduct(draft.productId, {
        categoryId: category.id,
        category: `${category.icon || "📦"} ${category.name}`
      });
      await deleteDraft(chatId);
      return showProductManagement(chatId, draft.productId);
    }

    draft.categoryId = category.id;
    draft.category = `${category.icon || "📦"} ${category.name}`;
    draft.step = "description";
    await saveDraft(chatId, draft);
    return wizardNext(chatId, draft);
  }

  if (data === "category:new") {
    await saveDraft(chatId, { step: "category_name" });
    return sendMessage(chatId, "نام دسته‌بندی جدید را ارسال کنید:");
  }

  if (data.startsWith("category:detail:")) {
    return showCategoryDetail(chatId, data.split(":")[2]);
  }

  if (data.startsWith("category:edit_name:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "category_edit_name", categoryId: id });
    return sendMessage(chatId, "نام جدید دسته‌بندی را بفرستید:");
  }

  if (data.startsWith("category:edit_icon:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "category_edit_icon", categoryId: id });
    return sendMessage(chatId, "آیکون جدید را بفرستید (مثلاً 👟):");
  }

  if (data.startsWith("category:delete:")) {
    const id = data.split(":")[2];
    await deleteCategory(id);
    await sendMessage(chatId, "✅ دسته‌بندی حذف شد.");
    return showCategories(chatId);
  }

  if (data === "product:new") return startProductWizard(chatId);

  if (data.startsWith("product:manage:")) {
    return showProductManagement(chatId, data.split(":")[2]);
  }

  if (data.startsWith("product:edit_name:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "edit_name", productId: id });
    return sendMessage(chatId, "نام جدید محصول را بفرستید:");
  }

  if (data.startsWith("product:edit_desc:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "edit_description", productId: id });
    return sendMessage(chatId, "توضیحات جدید را بفرستید:");
  }

  if (data.startsWith("product:edit_price:")) {
    const id = data.split(":")[2];
    const product = await getProduct(id);
    await saveDraft(chatId, {
      step: "edit_price",
      productId: id,
      compareAtPrice: product?.compareAtPrice || 0
    });
    return sendMessage(
      chatId,
      "قیمت *اصلی (واقعی)* جدید را به تومان وارد کنید:\n" +
        "(بعد از آن مقدار تخفیف را جداگانه می‌پرسد)"
    );
  }

  if (data.startsWith("product:edit_stock:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "edit_stock", productId: id });
    return sendMessage(chatId, "موجودی جدید را وارد کنید:");
  }

  if (data.startsWith("product:edit_cat:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "edit_category", productId: id });
    const { showCategorySelector } = require("./wizard");
    return showCategorySelector(chatId);
  }

  if (data.startsWith("product:edit_tags:")) {
    const id = data.split(":")[2];
    await saveDraft(chatId, { step: "edit_tags", productId: id });
    return sendMessage(chatId, "برچسب‌ها را با کاما وارد کنید (یا `ندارد`):");
  }

  if (data.startsWith("product:toggle:")) {
    const id = data.split(":")[2];
    const product = await getProduct(id);
    if (!product) return sendMessage(chatId, "محصول پیدا نشد.");
    await updateProduct(id, { active: !product.active });
    return showProductManagement(chatId, id);
  }

  if (data.startsWith("product:toggle_featured:")) {
    const id = data.split(":")[2];
    const product = await getProduct(id);
    if (!product) return sendMessage(chatId, "محصول پیدا نشد.");
    await updateProduct(id, { featured: !product.featured });
    return showProductManagement(chatId, id);
  }

  if (data.startsWith("product:delete:")) {
    const id = data.split(":")[2];
    await deleteProduct(id);
    await sendMessage(chatId, "✅ محصول حذف شد.");
    return showProducts(chatId);
  }

  if (data.startsWith("order:detail:")) {
    return showOrderDetail(chatId, data.split(":")[2]);
  }

  if (data.startsWith("order:status:")) {
    const parts = data.split(":");
    const orderId = parts[2];
    const status = parts[3];
    try {
      await updateOrderStatus(orderId, status);
      await sendMessage(chatId, `✅ وضعیت سفارش به «${status}» تغییر کرد.`);
      return showOrderDetail(chatId, orderId);
    } catch (err) {
      return sendMessage(chatId, "❌ " + err.message);
    }
  }

  if (data === "badge:new") {
    await saveDraft(chatId, { step: "badge_name" });
    return sendMessage(chatId, "نام برچسب جدید را بفرستید:");
  }

  if (data.startsWith("badge:detail:")) {
    return showBadges(chatId);
  }

  return sendMessage(chatId, "دستور ناشناخته.");
}

module.exports = {
  handleMessage,
  handleCallbackQuery,
  handleMainMenu
};
