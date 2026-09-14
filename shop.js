const API_URL = "https://hamedtest1.netlify.app/.netlify/functions/api";
const PRODUCTS_FALLBACK = "data/products.json";
const CATEGORIES_FALLBACK = "data/categories.json";
const BANNERS_FALLBACK = "data/banners.json";
const BALE_BOT_URL = "https://ble.ir/Hamedtestshop_bot";
const API_TIMEOUT_MS = 4000;

let products = [], categories = [], banners = [], cart = loadCart();
let currentCategory = "all", currentSearch = "", currentSort = "newest";
let priceMin = null, priceMax = null, stockFilter = "all";
let selectedProduct = null, selectedAttributes = {}, selectedQuantity = 1, lastOrderId = null;
let productModal, checkoutModal, successModal, cartOffcanvas;

function money(n) { return Math.round(Number(n) || 0).toLocaleString("fa-IR") + " تومان"; }
function toast(msg, type) {
  var el = document.getElementById("toast"); if (!el) return;
  el.textContent = msg; el.className = "toast-msg show " + (type || "");
  clearTimeout(toast._t); toast._t = setTimeout(function () { el.className = "toast-msg"; }, 2800);
}
function loadCart() { try { return JSON.parse(localStorage.getItem("hs_cart") || "[]"); } catch (e) { return []; } }
function saveCart() { localStorage.setItem("hs_cart", JSON.stringify(cart)); }
function loadCustomer() { try { return JSON.parse(localStorage.getItem("hs_customer") || "{}"); } catch (e) { return {}; } }
function saveCustomer(data) { localStorage.setItem("hs_customer", JSON.stringify(data || {})); }
function fillCustomerForm() {
  var c = loadCustomer(); if (!document.getElementById("customerName")) return;
  if (c.name) document.getElementById("customerName").value = c.name;
  if (c.phone) document.getElementById("customerPhone").value = c.phone;
  if (c.address) document.getElementById("customerAddress").value = c.address;
  if (c.note) document.getElementById("customerNote").value = c.note;
}

function pageDir() {
  var path = location.pathname || "/";
  if (/\.html?$/i.test(path)) return path.replace(/\/[^/]*$/, "/");
  if (!path.endsWith("/")) return path + "/";
  return path;
}
function assetUrl(path) {
  if (!path) return "";
  var s = String(path).trim();
  if (!s) return "";
  if (/^(https?:|data:|blob:)/i.test(s)) return s;
  s = s.replace(/^\.\//, "").replace(/^\/+/, "");
  try { return new URL(s, location.origin + pageDir()).href; }
  catch (e) { return pageDir() + s; }
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function fetchWithTimeout(url, options, ms) {
  var c = new AbortController(), t = setTimeout(function () { c.abort(); }, ms || API_TIMEOUT_MS);
  return fetch(url, Object.assign({}, options || {}, { signal: c.signal })).finally(function () { clearTimeout(t); });
}
function normalizeProduct(p) {
  var images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
  images = images.map(function (im) { return assetUrl(im); }).filter(Boolean);
  var compareAt = Number(p.compareAtPrice != null ? p.compareAtPrice : (p.price || 0));
  var final = Number(p.finalPrice != null ? p.finalPrice : (p.price || 0));
  return Object.assign({}, p, {
    images: images, image: images[0] || "", compareAtPrice: compareAt, finalPrice: final, price: final,
    discountPercent: Number(p.discountPercent || 0),
    totalStock: Number(p.totalStock != null ? p.totalStock : (p.stock || 0)),
    variants: Array.isArray(p.variants) ? p.variants : [], active: p.active !== false, featured: !!p.featured
  });
}

async function loadProductsFromFallback() {
  try {
    var res = await fetch(PRODUCTS_FALLBACK, { cache: "default" });
    if (!res.ok) return false;
    var data = await res.json();
    products = (Array.isArray(data) ? data : []).map(normalizeProduct).filter(function (p) { return p.active !== false; });
    return products.length > 0;
  } catch (e) { return false; }
}
async function loadCategoriesFromFallback() {
  try {
    var res = await fetch(CATEGORIES_FALLBACK, { cache: "default" });
    if (!res.ok) return false;
    var data = await res.json();
    categories = Array.isArray(data) ? data : [];
    return categories.length > 0;
  } catch (e) { return false; }
}
async function loadBannersFromFallback() {
  try {
    var res = await fetch(BANNERS_FALLBACK, { cache: "default" });
    if (!res.ok) return false;
    var data = await res.json();
    banners = (Array.isArray(data) ? data : []).filter(function (b) { return b && b.active !== false; });
    banners.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    return banners.length > 0;
  } catch (e) { return false; }
}
async function loadBanners() {
  try {
    var res = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "banners.list" }),
      cache: "no-store"
    }, API_TIMEOUT_MS);
    var data = await res.json();
    if (data && data.ok !== false && Array.isArray(data.result)) {
      banners = data.result.filter(function (b) { return b && b.active !== false; });
      banners.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
      if (banners.length) return;
    }
  } catch (e) {}
  await loadBannersFromFallback();
}
function renderHero() {
  var inner = document.getElementById("heroInner");
  var indicators = document.getElementById("heroIndicators");
  if (!inner) return;
  if (!banners.length) {
    inner.innerHTML = '<div class="carousel-item active"><div class="hero-slide-inner" style="background-image:linear-gradient(120deg,rgba(15,20,40,.9),rgba(15,52,96,.8))"><div><h2>مهیا شاپ</h2><p>به فروشگاه خوش آمدید.</p><a href="#productsSection" class="btn btn-dk mt-2">مشاهده محصولات</a></div></div></div>';
    if (indicators) indicators.innerHTML = "";
    return;
  }
  if (indicators) {
    indicators.innerHTML = banners.map(function (b, i) {
      return '<button type="button" data-bs-target="#heroCarousel" data-bs-slide-to="' + i + '"' + (i === 0 ? ' class="active"' : '') + '></button>';
    }).join("");
  }
  inner.innerHTML = banners.map(function (b, i) {
    var grad = (b.gradient || "linear-gradient(120deg,rgba(15,20,40,.85),rgba(15,52,96,.75))").replace(/"/g, "");
    var img = assetUrl((b.image || "").trim());
    var bg = img
      ? ("background-image:" + grad + ",url('" + img.replace(/'/g, "%27") + "')")
      : ("background-image:" + grad);
    var title = escapeHtml(b.title || "");
    var sub = escapeHtml(b.subtitle || "");
    var link = escapeHtml(b.link || "#productsSection");
    var btn = escapeHtml(b.buttonText || "مشاهده");
    return '<div class="carousel-item' + (i === 0 ? ' active' : '') + '">' +
      '<div class="hero-slide-inner" style="' + bg + '">' +
      '<div><h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') +
      '<a href="' + link + '" class="btn btn-dk mt-2">' + btn + '</a></div></div></div>';
  }).join("");
}

async function loadProducts() {
  try {
    var res = await fetchWithTimeout(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "products.list" }), cache: "no-store" }, API_TIMEOUT_MS);
    var data = await res.json();
    if (data && data.ok !== false && Array.isArray(data.result)) {
      products = data.result.map(normalizeProduct).filter(function (p) { return p.active !== false; });
      if (products.length) return;
    }
  } catch (e) {}
  await loadProductsFromFallback();
}
async function loadCategories() {
  try {
    var res = await fetchWithTimeout(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "categories.list" }), cache: "no-store" }, API_TIMEOUT_MS);
    var data = await res.json();
    var list = null;
    if (data && Array.isArray(data.result)) list = data.result;
    else if (Array.isArray(data)) list = data;
    if (list && list.length) {
      categories = list;
      return;
    }
  } catch (e) {}
  await loadCategoriesFromFallback();
}

function filteredProducts() {
  var list = products.slice();
  if (currentCategory && currentCategory !== "all") {
    list = list.filter(function (p) {
      return String(p.categoryId) === String(currentCategory) || (p.category || "").indexOf(currentCategory) !== -1;
    });
  }
  if (currentSearch) {
    var q = currentSearch.toLowerCase();
    list = list.filter(function (p) { return (p.name || "").toLowerCase().indexOf(q) !== -1 || (p.description || "").toLowerCase().indexOf(q) !== -1; });
  }
  if (priceMin != null && priceMin !== "") list = list.filter(function (p) { return p.finalPrice >= Number(priceMin); });
  if (priceMax != null && priceMax !== "") list = list.filter(function (p) { return p.finalPrice <= Number(priceMax); });
  if (stockFilter === "in") list = list.filter(function (p) { return p.totalStock > 0; });
  if (stockFilter === "out") list = list.filter(function (p) { return p.totalStock <= 0; });
  if (currentSort === "price_asc") list.sort(function (a, b) { return a.finalPrice - b.finalPrice; });
  else if (currentSort === "price_desc") list.sort(function (a, b) { return b.finalPrice - a.finalPrice; });
  else list.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return list;
}

function productCardHtml(p) {
  var disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice
    ? '<span class="disc-badge">' + p.discountPercent + '٪</span>' : '';
  var oldP = p.compareAtPrice > p.finalPrice ? '<span class="old-price">' + money(p.compareAtPrice) + '</span>' : '<span class="old-price"></span>';
  return '<div class="col-6 col-md-4 col-lg-3"><article class="product-card" data-id="' + p.id + '">' +
    '<div class="product-img">' + (p.image ? '<img src="' + p.image + '" alt="' + escapeHtml(p.name) + '" loading="lazy" width="300" height="300" />' : '') + disc + '</div>' +
    '<div class="product-body"><div class="product-cat">' + escapeHtml(p.category || '') + '</div>' +
    '<div class="product-title">' + escapeHtml(p.name) + '</div>' +
    '<div class="product-price"><div class="price-col">' + oldP + '<span class="final-price">' + money(p.finalPrice) + '</span></div>' +
    '<button type="button" class="btn-add" data-add="' + p.id + '" ' + (p.totalStock <= 0 ? 'disabled' : '') + '><i class="bi bi-cart-plus"></i></button></div></div></article></div>';
}

function renderProducts() {
  var grid = document.getElementById("productsGrid");
  if (!grid) return;
  var list = filteredProducts();
  if (!list.length) {
    grid.innerHTML = '<div class="col-12"><div class="empty-state">محصولی پیدا نشد</div></div>';
    return;
  }
  grid.innerHTML = list.map(productCardHtml).join("");
  grid.querySelectorAll("[data-id]").forEach(function (el) {
    el.onclick = function (e) {
      if (e.target.closest("[data-add]")) return;
      openProduct(el.getAttribute("data-id"));
    };
  });
  grid.querySelectorAll("[data-add]").forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      var p = products.find(function (x) { return x.id === btn.getAttribute("data-add"); });
      if (p) quickAdd(p);
    };
  });
}

function renderSpecials() {
  var wrap = document.getElementById("specialsRow");
  if (!wrap) return;
  var list = products.filter(function (p) {
    return p.featured || (p.discountPercent > 0 && p.compareAtPrice > p.finalPrice);
  }).slice(0, 12);
  if (!list.length) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = list.map(function (p) {
    var disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice
      ? '<span class="disc-badge">' + p.discountPercent + '٪</span>' : '';
    return '<article class="product-card" data-id="' + p.id + '"><div class="product-img">' +
      (p.image ? '<img src="' + p.image + '" alt="" loading="lazy" width="200" height="200" />' : '') + disc +
      '</div><div class="product-body"><div class="product-title">' + escapeHtml(p.name) +
      '</div><div class="final-price">' + money(p.finalPrice) + '</div></div></article>';
  }).join("");
  wrap.querySelectorAll("[data-id]").forEach(function (el) {
    el.onclick = function () { openProduct(el.getAttribute("data-id")); };
  });
}

function renderCategories() {
  var strip = document.getElementById("categoryStrip");
  var grid = document.getElementById("categoryCards");
  var filterSel = document.getElementById("filterCategory");
  var activeCats = categories.filter(function (c) { return c && c.active !== false; });

  var pills = '<button type="button" class="cat-pill' + (currentCategory === "all" ? " active" : "") + '" data-cat="all">همه</button>';
  activeCats.forEach(function (c) {
    pills += '<button type="button" class="cat-pill' + (String(currentCategory) === String(c.id) ? " active" : "") + '" data-cat="' + escapeHtml(String(c.id)) + '">' +
      (c.icon || "") + " " + escapeHtml(c.name) + '</button>';
  });
  if (strip) {
    strip.innerHTML = pills;
    strip.querySelectorAll("[data-cat]").forEach(function (b) {
      b.onclick = function () {
        currentCategory = b.getAttribute("data-cat");
        if (filterSel) filterSel.value = currentCategory;
        renderCategories();
        renderProducts();
        var sec = document.getElementById("productsSection");
        if (sec) sec.scrollIntoView({ behavior: "smooth" });
      };
    });
  }
  if (grid) {
    grid.innerHTML = activeCats.map(function (c) {
      return '<div class="col-4 col-md-3 col-lg-2"><div class="cat-card" data-cat="' + escapeHtml(String(c.id)) + '">' +
        '<div class="ico">' + (c.icon || "📦") + '</div><div class="name">' + escapeHtml(c.name) + '</div></div></div>';
    }).join("");
    grid.querySelectorAll("[data-cat]").forEach(function (el) {
      el.onclick = function () {
        currentCategory = el.getAttribute("data-cat");
        if (filterSel) filterSel.value = currentCategory;
        renderCategories();
        renderProducts();
        var sec = document.getElementById("productsSection");
        if (sec) sec.scrollIntoView({ behavior: "smooth" });
      };
    });
  }
  if (filterSel) {
    var prev = filterSel.value || currentCategory || "all";
    filterSel.innerHTML = '<option value="all">همه</option>' + activeCats.map(function (c) {
      return '<option value="' + escapeHtml(String(c.id)) + '">' + escapeHtml((c.icon || "") + " " + c.name) + '</option>';
    }).join("");
    filterSel.value = prev;
    if (!filterSel.value) filterSel.value = "all";
  }
}

function openProduct(id) {
  var p = products.find(function (x) { return x.id === id; });
  if (!p) return;
  selectedProduct = p;
  selectedAttributes = {};
  selectedQuantity = 1;
  var body = document.getElementById("productBox");
  if (!body) return;
  body.innerHTML =
    '<div class="modal-header"><h5 class="modal-title">' + escapeHtml(p.name) + '</h5>' +
    '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
    '<div class="modal-body">' +
    (p.image ? '<img class="modal-product-img" src="' + p.image + '" alt="" />' : '') +
    '<div class="text-muted small mb-2 mt-2">' + escapeHtml(p.category || '') + '</div>' +
    '<div class="mb-2"><strong>' + money(p.finalPrice) + '</strong>' +
    (p.compareAtPrice > p.finalPrice ? ' <span class="old-price">' + money(p.compareAtPrice) + '</span>' : '') +
    '</div>' +
    (p.description ? '<p class="small">' + escapeHtml(p.description) + '</p>' : '') +
    '<div class="d-flex align-items-center gap-2 mt-3 flex-wrap">' +
    '<button type="button" class="btn btn-outline-secondary btn-sm" id="qtyMinus">−</button>' +
    '<span id="qtyVal">1</span>' +
    '<button type="button" class="btn btn-outline-secondary btn-sm" id="qtyPlus">+</button>' +
    '</div></div>' +
    '<div class="modal-footer">' +
    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">بستن</button>' +
    '<button type="button" class="btn btn-dk" id="addToCartBtn">افزودن به سبد</button></div>';
  document.getElementById("qtyMinus").onclick = function () {
    selectedQuantity = Math.max(1, selectedQuantity - 1);
    document.getElementById("qtyVal").textContent = selectedQuantity;
  };
  document.getElementById("qtyPlus").onclick = function () {
    selectedQuantity += 1;
    document.getElementById("qtyVal").textContent = selectedQuantity;
  };
  document.getElementById("addToCartBtn").onclick = function () {
    addToCart(p, null, selectedQuantity);
    productModal.hide();
  };
  productModal.show();
}

function quickAdd(p) { addToCart(p, null, 1); }

function addToCart(product, variant, qty) {
  qty = qty || 1;
  var key = product.id + "|" + ((variant && variant.id) || "");
  var found = cart.find(function (c) { return c.key === key; });
  if (found) found.quantity += qty;
  else cart.push({
    key: key,
    productId: product.id,
    variantId: (variant && variant.id) || null,
    name: product.name,
    variantName: (variant && variant.name) || "",
    image: product.image,
    unitPrice: (variant && variant.price) || product.finalPrice,
    quantity: qty
  });
  saveCart();
  renderCart();
  toast("به سبد اضافه شد", "ok");
}

function cartCount() { return cart.reduce(function (s, i) { return s + i.quantity; }, 0); }
function cartTotal() { return cart.reduce(function (s, i) { return s + i.unitPrice * i.quantity; }, 0); }

function renderCart() {
  var badge = document.getElementById("cartCount");
  if (badge) {
    var n = cartCount();
    badge.textContent = n;
    badge.classList.toggle("d-none", n === 0);
  }
  var list = document.getElementById("cartItems");
  var totalEl = document.getElementById("cartTotal");
  if (totalEl) totalEl.textContent = money(cartTotal());
  if (!list) return;
  if (!cart.length) {
    list.innerHTML = '<div class="empty-state py-4">سبد خالی است</div>';
    return;
  }
  list.innerHTML = cart.map(function (item, idx) {
    return '<div class="c-item"><img src="' + (item.image || "") + '" alt="" loading="lazy" /><div><div class="c-title">' + escapeHtml(item.name) + '</div>' +
      (item.variantName ? '<div class="c-var">' + escapeHtml(item.variantName) + '</div>' : '') +
      '<div class="c-price">' + money(item.unitPrice * item.quantity) + '</div>' +
      '<div class="c-qty"><button type="button" data-dec="' + idx + '">−</button><span>' + item.quantity +
      '</span><button type="button" data-inc="' + idx + '">+</button></div></div>' +
      '<button type="button" class="btn btn-sm text-danger" data-rm="' + idx + '"><i class="bi bi-trash"></i></button></div>';
  }).join("");
  list.querySelectorAll("[data-inc]").forEach(function (b) {
    b.onclick = function () {
      cart[Number(b.getAttribute("data-inc"))].quantity += 1;
      saveCart();
      renderCart();
    };
  });
  list.querySelectorAll("[data-dec]").forEach(function (b) {
    b.onclick = function () {
      var i = Number(b.getAttribute("data-dec"));
      cart[i].quantity -= 1;
      if (cart[i].quantity <= 0) cart.splice(i, 1);
      saveCart();
      renderCart();
    };
  });
  list.querySelectorAll("[data-rm]").forEach(function (b) {
    b.onclick = function () {
      cart.splice(Number(b.getAttribute("data-rm")), 1);
      saveCart();
      renderCart();
    };
  });
}

async function submitOrder() {
  var name = document.getElementById("customerName").value.trim();
  var phone = document.getElementById("customerPhone").value.trim();
  var address = document.getElementById("customerAddress").value.trim();
  var note = document.getElementById("customerNote").value.trim();
  if (!name || !phone || !address) { toast("نام، موبایل و آدرس الزامی است", "err"); return; }
  if (!cart.length) { toast("سبد خالی است", "err"); return; }
  saveCustomer({ name: name, phone: phone, address: address, note: note });
  var items = cart.map(function (i) {
    return {
      productId: i.productId,
      variantId: i.variantId,
      name: i.name,
      variantName: i.variantName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      image: i.image
    };
  });
  var btn = document.getElementById("submitOrderBtn");
  if (btn) btn.disabled = true;
  try {
    var res = await fetchWithTimeout(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "orders.create",
        customer: { name: name, phone: phone, address: address },
        items: items,
        note: note,
        subtotal: cartTotal(),
        total: cartTotal()
      })
    }, 12000);
    var data = await res.json();
    if (!res.ok || data.ok === false) throw new Error((data && data.error) || "خطا در ثبت سفارش");
    var order = data.result || data;
    lastOrderId = order.id || order.orderId || "";
    cart = [];
    saveCart();
    renderCart();
    checkoutModal.hide();
    var oid = document.getElementById("successMsg");
    if (oid) oid.textContent = "کد سفارش: " + (lastOrderId || "—") + " — برای پرداخت، ربات بله را باز کنید.";
    successModal.show();
    var pay = document.getElementById("baleOpenBtn");
    if (pay) {
      pay.href = BALE_BOT_URL + (lastOrderId ? "?start=" + encodeURIComponent(lastOrderId) : "");
    }
  } catch (e) {
    toast(e.message || "خطا در ثبت سفارش", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  productModal = new bootstrap.Modal(document.getElementById("productModal"));
  checkoutModal = new bootstrap.Modal(document.getElementById("checkoutModal"));
  successModal = new bootstrap.Modal(document.getElementById("successModal"));
  var cartEl = document.getElementById("cartDrawer");
  if (cartEl) cartOffcanvas = new bootstrap.Offcanvas(cartEl);

  fillCustomerForm();
  renderCart();

  document.getElementById("searchInput") && document.getElementById("searchInput").addEventListener("input", function (e) {
    currentSearch = e.target.value.trim();
    renderProducts();
  });
  document.getElementById("sortSelect") && document.getElementById("sortSelect").addEventListener("change", function (e) {
    currentSort = e.target.value;
    renderProducts();
  });
  document.getElementById("priceMin") && document.getElementById("priceMin").addEventListener("change", function (e) {
    priceMin = e.target.value;
    renderProducts();
  });
  document.getElementById("priceMax") && document.getElementById("priceMax").addEventListener("change", function (e) {
    priceMax = e.target.value;
    renderProducts();
  });
  document.getElementById("filterStock") && document.getElementById("filterStock").addEventListener("change", function (e) {
    stockFilter = e.target.value;
    renderProducts();
  });

  var checkoutBtn = document.getElementById("checkoutBtn");
  if (checkoutBtn) {
    checkoutBtn.onclick = function () {
      if (!cart.length) { toast("سبد خالی است", "err"); return; }
      fillCustomerForm();
      var cnt = document.getElementById("checkoutItemsCount");
      var tot = document.getElementById("checkoutTotal");
      if (cnt) cnt.textContent = String(cartCount());
      if (tot) tot.textContent = money(cartTotal());
      checkoutModal.show();
    };
  }

  var checkoutForm = document.getElementById("checkoutForm");
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", function (e) {
      e.preventDefault();
      submitOrder();
    });
  } else {
    var sob = document.getElementById("submitOrderBtn");
    if (sob) sob.onclick = submitOrder;
  }

  var filterCat = document.getElementById("filterCategory");
  if (filterCat) {
    filterCat.addEventListener("change", function () {
      currentCategory = filterCat.value || "all";
      renderCategories();
      renderProducts();
    });
  }

  var applyBtn = document.getElementById("applyFiltersBtn");
  if (applyBtn) {
    applyBtn.onclick = function () {
      var fs = document.getElementById("filterStock");
      if (fs) stockFilter = fs.value;
      var pmin = document.getElementById("priceMin");
      var pmax = document.getElementById("priceMax");
      priceMin = pmin ? pmin.value : null;
      priceMax = pmax ? pmax.value : null;
      if (filterCat) currentCategory = filterCat.value || "all";
      renderProducts();
    };
  }
  var resetBtn = document.getElementById("resetFiltersBtn");
  if (resetBtn) {
    resetBtn.onclick = function () {
      currentCategory = "all";
      currentSearch = "";
      priceMin = null;
      priceMax = null;
      stockFilter = "all";
      currentSort = "newest";
      var si = document.getElementById("searchInput");
      if (si) si.value = "";
      var pmin = document.getElementById("priceMin");
      var pmax = document.getElementById("priceMax");
      if (pmin) pmin.value = "";
      if (pmax) pmax.value = "";
      var fs = document.getElementById("filterStock");
      if (fs) fs.value = "all";
      var ss = document.getElementById("sortSelect");
      if (ss) ss.value = "newest";
      if (filterCat) filterCat.value = "all";
      renderCategories();
      renderProducts();
    };
  }

  try {
    await Promise.all([loadProducts(), loadCategories(), loadBanners()]);
  } catch (e) {
    console.warn(e);
  }
  if (!categories.length) await loadCategoriesFromFallback();
  renderHero();
  renderCategories();
  renderSpecials();
  renderProducts();
  renderCart();
});
