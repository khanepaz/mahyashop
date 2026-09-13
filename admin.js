const API_URL = "https://hamedtest1.netlify.app/.netlify/functions/api";
const TOKEN_KEY = "mahyashop_admin_token";
const ADMIN_JSON = "data/admin.json";
const SESSION_FLAG = "mahyashop_admin_ok";

const STATUS_LABELS = {
  pending: "در انتظار",
  confirmed: "تأیید شده",
  packing: "آماده‌سازی",
  shipped: "ارسال شده",
  delivered: "تحویل",
  cancelled: "لغو",
  returned: "مرجوع"
};

let token = localStorage.getItem(TOKEN_KEY) || "";
let cache = {
  products: [],
  categories: [],
  orders: [],
  banners: [],
  discounts: [],
  customers: [],
  settings: {}
};

let productModal, categoryModal, bannerModal, discountModal, orderModal;
let editingBannerIndex = -1;

function money(n) {
  return Math.round(Number(n) || 0).toLocaleString("fa-IR") + " تومان";
}

function toast(msg, type) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast-adm show " + (type || "");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () {
    el.className = "toast-adm";
  }, 2800);
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(action, body, useAuth) {
  const headers = { "Content-Type": "application/json" };
  if (useAuth !== false && token) headers["X-Admin-Key"] = token;
  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(Object.assign({ action: action }, body || {}))
  });
  const data = await res.json().catch(function () {
    return { ok: false, error: "پاسخ نامعتبر" };
  });
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || "خطا در ارتباط با سرور");
  }
  return data.result !== undefined ? data.result : data;
}

function showApp(show) {
  document.getElementById("loginScreen").classList.toggle("d-none", show);
  document.getElementById("appShell").classList.toggle("d-none", !show);
}

function closeSidebar() {
  document.getElementById("adminSidebar").classList.remove("open");
  document.getElementById("sidebarBackdrop").classList.remove("show");
  document.body.classList.remove("menu-open");
}

function openSidebar() {
  document.getElementById("adminSidebar").classList.add("open");
  document.getElementById("sidebarBackdrop").classList.add("show");
  document.body.classList.add("menu-open");
}

const PAGE_META = {
  dashboard: ["داشبورد", "خلاصه فروشگاه"],
  products: ["محصولات", "افزودن و ویرایش کالا"],
  categories: ["دسته‌بندی‌ها", "مدیریت دسته‌ها"],
  banners: ["بنر / کاروسل", "اسلایدهای صفحه اول"],
  orders: ["سفارش‌ها", "پیگیری و تغییر وضعیت"],
  discounts: ["کد تخفیف", "کدهای تخفیف سفارش"],
  customers: ["مشتریان", "از روی سفارش‌ها"],
  settings: ["تنظیمات", "هزینه ارسال و نام فروشگاه"]
};

function goSection(id) {
  document.querySelectorAll(".section-view").forEach(function (s) {
    s.classList.toggle("active", s.id === "sec-" + id);
  });
  document.querySelectorAll("#sideNav .nav-link").forEach(function (a) {
    a.classList.toggle("active", a.dataset.section === id);
  });
  const meta = PAGE_META[id] || ["", ""];
  document.getElementById("pageTitle").textContent = meta[0];
  document.getElementById("pageSub").textContent = meta[1];
  closeSidebar();
  if (id === "dashboard") renderDashboard();
  if (id === "products") renderProducts();
  if (id === "categories") renderCategories();
  if (id === "banners") renderBanners();
  if (id === "orders") renderOrders();
  if (id === "discounts") renderDiscounts();
  if (id === "customers") renderCustomers();
  if (id === "settings") fillSettings();
}

async function loadAll() {
  const [products, categories, orders, banners, discounts, settings] =
    await Promise.all([
      api("products.list", {}, false).catch(function () { return []; }),
      api("categories.list", {}, false).catch(function () { return []; }),
      api("orders.list", {}, false).catch(function () { return []; }),
      api("banners.all", {}, false).catch(function () { return []; }),
      api("discounts.list", {}, false).catch(function () { return []; }),
      api("settings.get", {}, false).catch(function () { return {}; })
    ]);
  cache.products = Array.isArray(products) ? products : [];
  cache.categories = Array.isArray(categories) ? categories : [];
  cache.orders = Array.isArray(orders) ? orders : [];
  cache.banners = Array.isArray(banners) ? banners : [];
  cache.discounts = Array.isArray(discounts) ? discounts : [];
  cache.settings = settings || {};
  const map = {};
  cache.orders.forEach(function (o) {
    const c = o.customer || {};
    const key = (c.phone || "") + "|" + (c.name || "");
    if (!key || key === "|") return;
    if (!map[key]) {
      map[key] = {
        name: c.name || "—",
        phone: c.phone || "—",
        address: c.address || "",
        orders: 0,
        total: 0
      };
    }
    map[key].orders += 1;
    map[key].total += Number(o.total) || 0;
  });
  cache.customers = Object.values(map);
  if (!cache.products.length || !cache.categories.length) {
    try { await loadLocalFallback(); } catch (e) { console.warn(e); }
  }
}

function renderDashboard() {
  const paid = cache.orders.filter(function (o) {
    return o.paymentStatus === "paid";
  });
  const revenue = paid.reduce(function (s, o) {
    return s + (Number(o.total) || 0);
  }, 0);
  const activeProducts = cache.products.filter(function (p) {
    return p.active !== false;
  }).length;
  document.getElementById("dashStats").innerHTML =
    '<div class="col-6 col-lg-3"><div class="stat-card"><div class="label">محصولات</div><div class="value">' +
    activeProducts.toLocaleString("fa-IR") +
    '</div></div></div>' +
    '<div class="col-6 col-lg-3"><div class="stat-card"><div class="label">سفارش‌ها</div><div class="value">' +
    cache.orders.length.toLocaleString("fa-IR") +
    '</div></div></div>' +
    '<div class="col-6 col-lg-3"><div class="stat-card"><div class="label">پرداخت‌شده</div><div class="value">' +
    paid.length.toLocaleString("fa-IR") +
    '</div></div></div>' +
    '<div class="col-6 col-lg-3"><div class="stat-card"><div class="value" style="font-size:1.1rem">' +
    money(revenue) +
    "</div><div class=\"label\">فروش پرداختی</div></div></div>";

  const recent = cache.orders.slice().reverse().slice(0, 8);
  if (!recent.length) {
    document.getElementById("dashOrders").innerHTML =
      '<div class="empty-hint">هنوز سفارشی نیست</div>';
    return;
  }
  document.getElementById("dashOrders").innerHTML =
    '<div class="table-responsive"><table class="table table-adm table-hover mb-0"><thead><tr>' +
    "<th>کد</th><th>مشتری</th><th>مبلغ</th><th>وضعیت</th><th>پرداخت</th></tr></thead><tbody>" +
    recent
      .map(function (o) {
        return (
          "<tr style=\"cursor:pointer\" data-oid=\"" +
          escapeHtml(o.id) +
          "\"><td class=\"small\">" +
          escapeHtml(o.id) +
          "</td><td>" +
          escapeHtml((o.customer && o.customer.name) || "—") +
          "</td><td>" +
          money(o.total) +
          "</td><td>" +
          escapeHtml(STATUS_LABELS[o.status] || o.status) +
          "</td><td>" +
          (o.paymentStatus === "paid"
            ? '<span class="badge-soft badge-paid">پرداخت شده</span>'
            : '<span class="badge-soft badge-unpaid">نشده</span>') +
          "</td></tr>"
        );
      })
      .join("") +
    "</tbody></table></div>";
  document.querySelectorAll("#dashOrders [data-oid]").forEach(function (tr) {
    tr.onclick = function () {
      openOrder(tr.dataset.oid);
    };
  });
}

function renderProducts() {
  const q = (document.getElementById("productSearch").value || "").trim().toLowerCase();
  const f = document.getElementById("productFilterActive").value;
  let list = cache.products.slice();
  if (q) {
    list = list.filter(function (p) {
      return (p.name || "").toLowerCase().indexOf(q) !== -1;
    });
  }
  if (f === "on") list = list.filter(function (p) { return p.active !== false; });
  if (f === "off") list = list.filter(function (p) { return p.active === false; });

  if (!list.length) {
    document.getElementById("productsTableWrap").innerHTML =
      '<div class="empty-hint">محصولی نیست — دکمه «محصول جدید» را بزنید</div>';
    return;
  }

  document.getElementById("productsTableWrap").innerHTML =
    '<table class="table table-adm table-hover align-middle"><thead><tr>' +
    "<th></th><th>نام</th><th>قیمت</th><th>موجودی</th><th>وضعیت</th><th></th></tr></thead><tbody>" +
    list
      .map(function (p) {
        const disc =
          p.discountPercent > 0 && p.compareAtPrice > p.finalPrice
            ? '<div class="small text-danger">' + p.discountPercent + "٪ تخفیف</div>"
            : "";
        return (
          "<tr><td>" +
          (p.image || (p.images && p.images[0])
            ? '<img class="thumb" src="' +
              escapeHtml(p.image || p.images[0]) +
              '" alt="" />'
            : '<div class="thumb"></div>') +
          "</td><td><div class=\"fw-semibold\">" +
          escapeHtml(p.name) +
          "</div><div class=\"small text-muted\">" +
          escapeHtml(p.category || "") +
          "</div></td><td>" +
          money(p.finalPrice) +
          disc +
          "</td><td>" +
          (p.totalStock != null ? p.totalStock : p.stock || 0) +
          "</td><td>" +
          (p.active !== false
            ? '<span class="badge-soft badge-on">فعال</span>'
            : '<span class="badge-soft badge-off">غیرفعال</span>') +
          (p.featured ? ' <span class="badge-soft badge-paid">ویژه</span>' : "") +
          '</td><td class="text-nowrap">' +
          '<button type="button" class="btn btn-sm btn-outline-primary me-1" data-edit="' +
          escapeHtml(p.id) +
          '">ویرایش</button>' +
          '<button type="button" class="btn btn-sm btn-outline-danger" data-del="' +
          escapeHtml(p.id) +
          '">حذف</button></td></tr>'
        );
      })
      .join("") +
    "</tbody></table>";

  document.querySelectorAll("[data-edit]").forEach(function (b) {
    b.onclick = function () {
      openProductEditor(b.dataset.edit);
    };
  });
  document.querySelectorAll("[data-del]").forEach(function (b) {
    b.onclick = async function () {
      if (!confirm("حذف این محصول؟")) return;
      try {
        await api("products.delete", { id: b.dataset.del });
        toast("حذف شد", "ok");
        await loadAll();
        renderProducts();
      } catch (e) {
        toast(e.message, "err");
      }
    };
  });
}

function fillCategorySelect(selected) {
  const sel = document.getElementById("pCategory");
  sel.innerHTML =
    '<option value="">— بدون دسته —</option>' +
    cache.categories
      .map(function (c) {
        return (
          '<option value="' +
          escapeHtml(c.id) +
          '"' +
          (selected === c.id ? " selected" : "") +
          ">" +
          escapeHtml((c.icon || "") + " " + c.name) +
          "</option>"
        );
      })
      .join("");
}

function openProductEditor(id) {
  const p = id ? cache.products.find(function (x) { return x.id === id; }) : null;
  document.getElementById("productModalTitle").textContent = p ? "ویرایش محصول" : "محصول جدید";
  document.getElementById("pId").value = p ? p.id : "";
  document.getElementById("pName").value = p ? p.name || "" : "";
  document.getElementById("pDesc").value = p ? p.description || "" : "";
  document.getElementById("pCompare").value = p ? p.compareAtPrice || p.price || 0 : "";
  document.getElementById("pDiscType").value = (p && p.discountType) || "none";
  document.getElementById("pDiscVal").value = (p && p.discountValue) || 0;
  document.getElementById("pStock").value = p ? (p.totalStock != null ? p.totalStock : p.stock || 0) : 0;
  document.getElementById("pImage").value = p ? p.image || (p.images && p.images[0]) || "" : "";
  document.getElementById("pTags").value = p && p.tags ? p.tags.join(", ") : "";
  document.getElementById("pActive").checked = !p || p.active !== false;
  document.getElementById("pFeatured").checked = !!(p && p.featured);
  fillCategorySelect(p ? p.categoryId : "");
  productModal.show();
}

async function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById("pId").value;
  const catId = document.getElementById("pCategory").value;
  const cat = cache.categories.find(function (c) { return String(c.id) === String(catId); });
  const tagsRaw = document.getElementById("pTags").value.trim();
  const tags = tagsRaw ? tagsRaw.split(",").map(function (t) { return t.trim(); }).filter(Boolean) : [];
  const image = document.getElementById("pImage").value.trim();
  const payload = {
    name: document.getElementById("pName").value.trim(),
    description: document.getElementById("pDesc").value.trim(),
    compareAtPrice: Number(document.getElementById("pCompare").value) || 0,
    discountType: document.getElementById("pDiscType").value,
    discountValue: Number(document.getElementById("pDiscVal").value) || 0,
    stock: Number(document.getElementById("pStock").value) || 0,
    totalStock: Number(document.getElementById("pStock").value) || 0,
    categoryId: catId || null,
    category: cat ? (cat.icon || "📦") + " " + cat.name : "",
    image: image || null,
    images: image ? [image] : [],
    tags: tags,
    active: document.getElementById("pActive").checked,
    featured: document.getElementById("pFeatured").checked
  };
  const btn = document.getElementById("productSaveBtn");
  btn.disabled = true;
  try {
    if (id) await api("products.update", { id: id, changes: payload });
    else await api("products.create", { product: payload });
    productModal.hide();
    toast("ذخیره شد", "ok");
    await loadAll();
    renderProducts();
  } catch (err) {
    toast(err.message, "err");
  } finally {
    btn.disabled = false;
  }
}

function renderCategories() {
  if (!cache.categories.length) {
    document.getElementById("categoriesTableWrap").innerHTML = '<div class="empty-hint">دسته‌ای تعریف نشده</div>';
    return;
  }
  document.getElementById("categoriesTableWrap").innerHTML =
    '<table class="table table-adm table-hover mb-0"><thead><tr><th>آیکون</th><th>نام</th><th>وضعیت</th><th></th></tr></thead><tbody>' +
    cache.categories.map(function (c) {
      return "<tr><td class=\"fs-4\">" + escapeHtml(c.icon || "📦") + "</td><td>" + escapeHtml(c.name) +
        "</td><td>" + (c.active !== false ? '<span class="badge-soft badge-on">فعال</span>' : '<span class="badge-soft badge-off">غیرفعال</span>') +
        '</td><td><button type="button" class="btn btn-sm btn-outline-primary me-1" data-cedit="' + escapeHtml(c.id) +
        '">ویرایش</button><button type="button" class="btn btn-sm btn-outline-danger" data-cdel="' + escapeHtml(c.id) + '">حذف</button></td></tr>';
    }).join("") + "</tbody></table>";
  document.querySelectorAll("[data-cedit]").forEach(function (b) {
    b.onclick = function () { openCategoryEditor(b.dataset.cedit); };
  });
  document.querySelectorAll("[data-cdel]").forEach(function (b) {
    b.onclick = async function () {
      if (!confirm("حذف دسته‌بندی؟")) return;
      try {
        await api("categories.delete", { id: b.dataset.cdel });
        toast("حذف شد", "ok");
        await loadAll();
        renderCategories();
      } catch (e) { toast(e.message, "err"); }
    };
  });
}

function openCategoryEditor(id) {
  const c = id ? cache.categories.find(function (x) { return x.id === id; }) : null;
  document.getElementById("cId").value = c ? c.id : "";
  document.getElementById("cName").value = c ? c.name : "";
  document.getElementById("cIcon").value = c ? c.icon || "📦" : "📦";
  document.getElementById("cActive").checked = !c || c.active !== false;
  categoryModal.show();
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById("cId").value;
  const body = {
    name: document.getElementById("cName").value.trim(),
    icon: document.getElementById("cIcon").value.trim() || "📦",
    active: document.getElementById("cActive").checked
  };
  try {
    if (id) await api("categories.update", { id: id, changes: body });
    else await api("categories.create", { category: body });
    categoryModal.hide();
    toast("ذخیره شد", "ok");
    await loadAll();
    renderCategories();
  } catch (err) { toast(err.message, "err"); }
}

function renderBanners() {
  const list = cache.banners.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  if (!list.length) {
    document.getElementById("bannersTableWrap").innerHTML = '<div class="empty-hint">بنری نیست — بنر جدید اضافه کنید</div>';
    return;
  }
  document.getElementById("bannersTableWrap").innerHTML =
    '<table class="table table-adm table-hover mb-0"><thead><tr><th>ترتیب</th><th>عنوان</th><th>عکس</th><th>وضعیت</th><th></th></tr></thead><tbody>' +
    list.map(function (b, idx) {
      return "<tr><td>" + (b.order || idx + 1) + "</td><td><div class=\"fw-semibold\">" + escapeHtml(b.title) +
        '</div><div class="small text-muted">' + escapeHtml(b.subtitle || "") + "</div></td><td>" +
        (b.image ? '<img class="thumb" src="' + escapeHtml(b.image) + '" alt="" />' : '<span class="small text-muted">بدون عکس</span>') +
        "</td><td>" + (b.active !== false ? '<span class="badge-soft badge-on">فعال</span>' : '<span class="badge-soft badge-off">غیرفعال</span>') +
        '</td><td><button type="button" class="btn btn-sm btn-outline-primary me-1" data-bedit="' + idx +
        '">ویرایش</button><button type="button" class="btn btn-sm btn-outline-danger" data-bdel="' + idx + '">حذف</button></td></tr>';
    }).join("") + "</tbody></table>";
  document.querySelectorAll("[data-bedit]").forEach(function (btn) {
    btn.onclick = function () { openBannerEditor(Number(btn.dataset.bedit)); };
  });
  document.querySelectorAll("[data-bdel]").forEach(function (btn) {
    btn.onclick = async function () {
      if (!confirm("حذف این بنر؟")) return;
      const sorted = cache.banners.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      sorted.splice(Number(btn.dataset.bdel), 1);
      try {
        await api("banners.save", { banners: sorted });
        toast("حذف شد", "ok");
        await loadAll();
        renderBanners();
      } catch (e) { toast(e.message, "err"); }
    };
  });
}

function openBannerEditor(index) {
  editingBannerIndex = index;
  const sorted = cache.banners.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  const b = index >= 0 ? sorted[index] : null;
  document.getElementById("bId").value = b ? b.id || "" : "";
  document.getElementById("bTitle").value = b ? b.title || "" : "";
  document.getElementById("bSubtitle").value = b ? b.subtitle || "" : "";
  document.getElementById("bImage").value = b ? b.image || "" : "";
  document.getElementById("bGradient").value = b && b.gradient ? b.gradient : "linear-gradient(120deg, rgba(15,20,40,.92), rgba(15,52,96,.85))";
  document.getElementById("bLink").value = b ? b.link || "" : "#productsSection";
  document.getElementById("bButtonText").value = b ? b.buttonText || "" : "مشاهده";
  document.getElementById("bOrder").value = b ? b.order || 1 : sorted.length + 1;
  document.getElementById("bActive").checked = !b || b.active !== false;
  bannerModal.show();
}

async function saveBanner(e) {
  e.preventDefault();
  const sorted = cache.banners.slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  const item = {
    id: document.getElementById("bId").value || "bn_" + Date.now().toString(36),
    title: document.getElementById("bTitle").value.trim(),
    subtitle: document.getElementById("bSubtitle").value.trim(),
    image: document.getElementById("bImage").value.trim(),
    gradient: document.getElementById("bGradient").value.trim(),
    link: document.getElementById("bLink").value.trim(),
    buttonText: document.getElementById("bButtonText").value.trim(),
    order: Number(document.getElementById("bOrder").value) || 1,
    active: document.getElementById("bActive").checked
  };
  if (editingBannerIndex >= 0 && editingBannerIndex < sorted.length) sorted[editingBannerIndex] = item;
  else sorted.push(item);
  try {
    await api("banners.save", { banners: sorted });
    bannerModal.hide();
    toast("بنر ذخیره شد", "ok");
    await loadAll();
    renderBanners();
  } catch (err) { toast(err.message, "err"); }
}

function renderOrders() {
  const sf = document.getElementById("orderStatusFilter").value;
  const pf = document.getElementById("orderPayFilter").value;
  let list = cache.orders.slice().reverse();
  if (sf !== "all") list = list.filter(function (o) { return o.status === sf; });
  if (pf === "paid") list = list.filter(function (o) { return o.paymentStatus === "paid"; });
  if (pf === "unpaid") list = list.filter(function (o) { return o.paymentStatus !== "paid"; });
  if (!list.length) {
    document.getElementById("ordersTableWrap").innerHTML = '<div class="empty-hint">سفارشی با این فیلتر نیست</div>';
    return;
  }
  document.getElementById("ordersTableWrap").innerHTML =
    '<table class="table table-adm table-hover"><thead><tr><th>کد</th><th>مشتری</th><th>مبلغ</th><th>وضعیت</th><th>پرداخت</th><th></th></tr></thead><tbody>' +
    list.map(function (o) {
      return "<tr><td class=\"small\">" + escapeHtml(o.id) + "</td><td>" + escapeHtml((o.customer && o.customer.name) || "—") +
        '<div class="small text-muted">' + escapeHtml((o.customer && o.customer.phone) || "") + "</div></td><td>" + money(o.total) +
        "</td><td>" + escapeHtml(STATUS_LABELS[o.status] || o.status) + "</td><td>" +
        (o.paymentStatus === "paid" ? '<span class="badge-soft badge-paid">شده</span>' : '<span class="badge-soft badge-unpaid">نشده</span>') +
        '</td><td><button type="button" class="btn btn-sm btn-outline-primary" data-oid="' + escapeHtml(o.id) + '">جزئیات</button></td></tr>';
    }).join("") + "</tbody></table>";
  document.querySelectorAll("[data-oid]").forEach(function (b) {
    b.onclick = function () { openOrder(b.dataset.oid); };
  });
}

function openOrder(id) {
  const o = cache.orders.find(function (x) { return x.id === id; });
  if (!o) return;
  const c = o.customer || {};
  const items = (o.items || []).map(function (i) {
    return "<li>" + escapeHtml(i.name) + (i.variantName ? " (" + escapeHtml(i.variantName) + ")" : "") +
      " × " + i.quantity + " = " + money(i.total) + "</li>";
  }).join("");
  document.getElementById("orderDetailBody").innerHTML =
    '<div class="mb-2"><strong>کد:</strong> ' + escapeHtml(o.id) + "</div>" +
    "<div class=\"mb-2\"><strong>وضعیت:</strong> " + escapeHtml(STATUS_LABELS[o.status] || o.status) +
    " · <strong>پرداخت:</strong> " + (o.paymentStatus === "paid" ? "شده" : "نشده") + "</div>" +
    "<div class=\"mb-2\"><strong>مبلغ:</strong> " + money(o.total) + "</div>" +
    "<div class=\"mb-2\"><strong>مشتری:</strong> " + escapeHtml(c.name || "—") + " / " + escapeHtml(c.phone || "—") +
    "<br/>" + escapeHtml(c.address || "") + "</div>" +
    (o.note ? "<div class=\"mb-2\"><strong>توضیح:</strong> " + escapeHtml(o.note) + "</div>" : "") +
    "<ul class=\"mb-0\">" + items + "</ul>";
  const statuses = ["confirmed", "packing", "shipped", "delivered", "cancelled", "returned"];
  document.getElementById("orderStatusBtns").innerHTML =
    statuses.map(function (s) {
      return '<button type="button" class="btn btn-sm btn-outline-secondary" data-st="' + s + '">' + (STATUS_LABELS[s] || s) + "</button>";
    }).join("") +
    '<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">بستن</button>';
  document.querySelectorAll("#orderStatusBtns [data-st]").forEach(function (btn) {
    btn.onclick = async function () {
      try {
        await api("orders.status.update", { id: o.id, status: btn.dataset.st });
        toast("وضعیت به‌روز شد", "ok");
        await loadAll();
        orderModal.hide();
        renderOrders();
      } catch (e) { toast(e.message, "err"); }
    };
  });
  orderModal.show();
}

function renderDiscounts() {
  if (!cache.discounts.length) {
    document.getElementById("discountsTableWrap").innerHTML = '<div class="empty-hint">کد تخفیفی نیست</div>';
    return;
  }
  document.getElementById("discountsTableWrap").innerHTML =
    '<table class="table table-adm table-hover mb-0"><thead><tr><th>کد</th><th>نوع</th><th>مقدار</th><th>وضعیت</th><th></th></tr></thead><tbody>' +
    cache.discounts.map(function (d) {
      return "<tr><td><code>" + escapeHtml(d.code) + "</code></td><td>" + (d.type === "amount" ? "مبلغی" : "درصدی") +
        "</td><td>" + (d.type === "amount" ? money(d.value) : d.value + "٪") + "</td><td>" +
        (d.active !== false ? '<span class="badge-soft badge-on">فعال</span>' : '<span class="badge-soft badge-off">غیرفعال</span>') +
        '</td><td><button type="button" class="btn btn-sm btn-outline-primary me-1" data-dedit="' + escapeHtml(d.id || d.code) +
        '">ویرایش</button><button type="button" class="btn btn-sm btn-outline-danger" data-ddel="' + escapeHtml(d.id || d.code) + '">حذف</button></td></tr>';
    }).join("") + "</tbody></table>";
  document.querySelectorAll("[data-dedit]").forEach(function (b) {
    b.onclick = function () { openDiscountEditor(b.dataset.dedit); };
  });
  document.querySelectorAll("[data-ddel]").forEach(function (b) {
    b.onclick = async function () {
      if (!confirm("حذف کد؟")) return;
      try {
        await api("discounts.delete", { id: b.dataset.ddel });
        toast("حذف شد", "ok");
        await loadAll();
        renderDiscounts();
      } catch (e) { toast(e.message, "err"); }
    };
  });
}

function openDiscountEditor(id) {
  const d = id ? cache.discounts.find(function (x) { return String(x.id) === String(id) || x.code === id; }) : null;
  document.getElementById("dId").value = d ? d.id || d.code : "";
  document.getElementById("dCode").value = d ? d.code : "";
  document.getElementById("dType").value = d ? d.type || "percent" : "percent";
  document.getElementById("dValue").value = d ? d.value : "";
  document.getElementById("dActive").checked = !d || d.active !== false;
  discountModal.show();
}

async function saveDiscount(e) {
  e.preventDefault();
  const id = document.getElementById("dId").value;
  const body = {
    code: document.getElementById("dCode").value.trim(),
    type: document.getElementById("dType").value,
    value: Number(document.getElementById("dValue").value) || 0,
    active: document.getElementById("dActive").checked
  };
  try {
    if (id) await api("discounts.update", { id: id, changes: body });
    else await api("discounts.create", body);
    discountModal.hide();
    toast("ذخیره شد", "ok");
    await loadAll();
    renderDiscounts();
  } catch (err) { toast(err.message, "err"); }
}

function renderCustomers() {
  if (!cache.customers.length) {
    document.getElementById("customersTableWrap").innerHTML = '<div class="empty-hint">هنوز مشتری از سفارش استخراج نشده</div>';
    return;
  }
  document.getElementById("customersTableWrap").innerHTML =
    '<table class="table table-adm table-hover mb-0"><thead><tr><th>نام</th><th>موبایل</th><th>تعداد سفارش</th><th>جمع خرید</th></tr></thead><tbody>' +
    cache.customers.map(function (c) {
      return "<tr><td>" + escapeHtml(c.name) + "</td><td>" + escapeHtml(c.phone) + "</td><td>" + c.orders + "</td><td>" + money(c.total) + "</td></tr>";
    }).join("") + "</tbody></table>";
}

function fillSettings() {
  const s = cache.settings || {};
  document.getElementById("setShopName").value = s.shopName || "";
  document.getElementById("setCurrency").value = s.currency || "IRR";
  document.getElementById("setShipping").value = s.shippingCost || 0;
  document.getElementById("setFreeShip").value = s.freeShippingThreshold || 0;
}

async function saveSettings(e) {
  e.preventDefault();
  try {
    await api("settings.update", {
      settings: {
        shopName: document.getElementById("setShopName").value.trim(),
        currency: document.getElementById("setCurrency").value.trim() || "IRR",
        shippingCost: Number(document.getElementById("setShipping").value) || 0,
        freeShippingThreshold: Number(document.getElementById("setFreeShip").value) || 0
      }
    });
    toast("تنظیمات ذخیره شد", "ok");
    await loadAll();
  } catch (err) { toast(err.message, "err"); }
}

async function fetchAdminConfig() {
  try {
    var res = await fetch(ADMIN_JSON, { cache: "no-store" });
    if (!res.ok) throw new Error("فایل ادمین پیدا نشد");
    return await res.json();
  } catch (e) {
    try {
      var res2 = await fetch("./data/admin.json", { cache: "no-store" });
      if (!res2.ok) throw e;
      return await res2.json();
    } catch (e2) {
      throw new Error("نتوانستم فایل رمز ادمین را بخوانم (data/admin.json)");
    }
  }
}

async function loadLocalFallback() {
  async function j(path, fb) {
    try {
      var r = await fetch(path, { cache: "no-store" });
      if (!r.ok) return fb;
      return await r.json();
    } catch (e) { return fb; }
  }
  cache.products = await j("data/products.json", cache.products || []);
  cache.categories = await j("data/categories.json", cache.categories || []);
  cache.orders = await j("data/orders.json", cache.orders || []);
  cache.banners = await j("data/banners.json", cache.banners || []);
  cache.discounts = await j("data/discounts.json", cache.discounts || []);
  cache.settings = await j("data/settings.json", cache.settings || {});
  if (!Array.isArray(cache.products)) cache.products = [];
  if (!Array.isArray(cache.categories)) cache.categories = [];
  if (!Array.isArray(cache.orders)) cache.orders = [];
  if (!Array.isArray(cache.banners)) cache.banners = [];
  if (!Array.isArray(cache.discounts)) cache.discounts = [];
}

async function tryAutoLogin() {
  var ok = localStorage.getItem(SESSION_FLAG) === "1";
  if (!ok && !token) {
    showApp(false);
    return;
  }
  try { await loadAll(); } catch (e) { console.warn(e); }
  try { await loadLocalFallback(); } catch (e2) { console.warn(e2); }
  showApp(true);
  goSection("dashboard");
}

document.addEventListener("DOMContentLoaded", function () {
  productModal = new bootstrap.Modal(document.getElementById("productModal"));
  categoryModal = new bootstrap.Modal(document.getElementById("categoryModal"));
  bannerModal = new bootstrap.Modal(document.getElementById("bannerModal"));
  discountModal = new bootstrap.Modal(document.getElementById("discountModal"));
  orderModal = new bootstrap.Modal(document.getElementById("orderModal"));

  document.getElementById("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    const btn = document.getElementById("loginBtn");
    btn.disabled = true;
    try {
      var password = document.getElementById("loginPassword").value;
      var cfg = await fetchAdminConfig();
      var expected = String((cfg && cfg.password) || "").trim();
      if (!expected) throw new Error("رمز در data/admin.json تنظیم نشده");
      if (String(password).trim() !== expected) {
        throw new Error("رمز عبور نادرست است");
      }
      token = expected;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(SESSION_FLAG, "1");
      try { await loadAll(); } catch (apiErr) { console.warn("API (اختیاری):", apiErr); }
      await loadLocalFallback();
      showApp(true);
      goSection("dashboard");
      toast("خوش آمدید", "ok");
    } catch (err) {
      toast(err.message || "ورود ناموفق", "err");
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("logoutBtn").onclick = function () {
    token = "";
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_FLAG);
    showApp(false);
  };

  document.getElementById("menuToggle").onclick = openSidebar;
  document.getElementById("sidebarBackdrop").onclick = closeSidebar;

  document.querySelectorAll("#sideNav [data-section]").forEach(function (a) {
    a.onclick = function (e) {
      e.preventDefault();
      goSection(a.dataset.section);
    };
  });

  document.getElementById("refreshBtn").onclick = async function () {
    try {
      await loadAll();
      try { await loadLocalFallback(); } catch (e) {}
      const active = document.querySelector(".section-view.active");
      const id = active ? active.id.replace("sec-", "") : "dashboard";
      goSection(id);
      toast("بروز شد", "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  };

  document.getElementById("btnNewProduct").onclick = function () { openProductEditor(null); };
  document.getElementById("productForm").addEventListener("submit", saveProduct);
  document.getElementById("productSearch").addEventListener("input", renderProducts);
  document.getElementById("productFilterActive").addEventListener("change", renderProducts);

  document.getElementById("btnNewCategory").onclick = function () { openCategoryEditor(null); };
  document.getElementById("categoryForm").addEventListener("submit", saveCategory);

  document.getElementById("btnNewBanner").onclick = function () { openBannerEditor(-1); };
  document.getElementById("bannerForm").addEventListener("submit", saveBanner);

  document.getElementById("btnNewDiscount").onclick = function () { openDiscountEditor(null); };
  document.getElementById("discountForm").addEventListener("submit", saveDiscount);

  document.getElementById("orderStatusFilter").addEventListener("change", renderOrders);
  document.getElementById("orderPayFilter").addEventListener("change", renderOrders);

  document.getElementById("settingsForm").addEventListener("submit", saveSettings);

  tryAutoLogin();
});
