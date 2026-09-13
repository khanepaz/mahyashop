const API_URL = "https://hamedtest1.netlify.app/.netlify/functions/api";
const PRODUCTS_FALLBACK = "data/products.json";
const CATEGORIES_FALLBACK = "data/categories.json";
const BALE_BOT_URL = "https://ble.ir/Hamedtestshop_bot";
const API_TIMEOUT_MS = 4000;

let products = [], categories = [], cart = loadCart();
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
  var compareAt = Number(p.compareAtPrice != null ? p.compareAtPrice : (p.price || 0));
  var final = Number(p.finalPrice != null ? p.finalPrice : (p.price || 0));
  return Object.assign({}, p, {
    images: images, image: images[0] || "", compareAtPrice: compareAt, finalPrice: final, price: final,
    discountPercent: Number(p.discountPercent || 0),
    totalStock: Number(p.totalStock != null ? p.totalStock : (p.stock || 0)),
    variants: Array.isArray(p.variants) ? p.variants : [], active: p.active !== false, featured: !!p.featured
  });
}
async function loadLocalProducts() {
  try {
    var res = await fetch(PRODUCTS_FALLBACK, { cache: "default" }); if (!res.ok) return false;
    var data = await res.json(), list = Array.isArray(data) ? data : (data.products || []);
    products = list.map(normalizeProduct).filter(function (p) { return p.active !== false; });
    return products.length > 0;
  } catch (e) { return false; }
}
async function loadLocalCategories() {
  try {
    var res = await fetch(CATEGORIES_FALLBACK, { cache: "default" }); if (!res.ok) return false;
    categories = (await res.json() || []).filter(function (c) { return c.active !== false; }); return true;
  } catch (e) { return false; }
}
async function loadApiProducts() {
  var res = await fetchWithTimeout(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "products.list" }), cache: "no-store" }, API_TIMEOUT_MS);
  var data = await res.json();
  if (data && data.ok && Array.isArray(data.result)) {
    products = data.result.map(normalizeProduct).filter(function (p) { return p.active !== false; }); return true;
  }
  return false;
}
async function loadApiCategories() {
  var res = await fetchWithTimeout(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "categories.list" }), cache: "no-store" }, API_TIMEOUT_MS);
  var data = await res.json();
  if (data && data.ok && Array.isArray(data.result)) {
    categories = data.result.filter(function (c) { return c.active !== false; }); return true;
  }
  return false;
}
async function loadData() {
  var grid = document.getElementById("productsGrid");
  if (grid) grid.innerHTML = '<div class="col-12"><div class="empty-state"><div class="spinner-dk"></div>در حال بارگذاری...</div></div>';
  await Promise.all([loadLocalProducts(), loadLocalCategories()]);
  if (products.length || categories.length) { renderCategories(); renderSpecials(); renderProducts(); updateCartUI(); }
  try {
    var okP = await loadApiProducts(), okC = await loadApiCategories();
    if (okP || okC) { renderCategories(); renderSpecials(); renderProducts(); updateCartUI(); }
  } catch (e) { console.warn(e); }
  if (!products.length && grid) grid.innerHTML = '<div class="col-12"><div class="empty-state">محصولی برای نمایش نیست</div></div>';
  updateCartUI();
}
function setCategory(id) {
  currentCategory = id || "all";
  var fc = document.getElementById("filterCategory"); if (fc) fc.value = currentCategory;
  document.querySelectorAll(".cat-pill").forEach(function (b) { b.classList.toggle("active", b.dataset.cat === currentCategory); });
  renderProducts();
}
function renderCategories() {
  var strip = document.getElementById("categoryStrip");
  var cards = document.getElementById("categoryCards");
  var filterCat = document.getElementById("filterCategory");
  var items = [{ id: "all", name: "همه", icon: "✨" }].concat(categories);
  if (strip) {
    strip.innerHTML = items.map(function (c) {
      return '<button type="button" class="cat-pill ' + (currentCategory === c.id ? "active" : "") + '" data-cat="' + c.id + '">' + (c.icon || "") + " " + escapeHtml(c.name) + "</button>";
    }).join("");
    strip.querySelectorAll(".cat-pill").forEach(function (btn) { btn.onclick = function () { setCategory(btn.dataset.cat); }; });
  }
  if (cards) {
    cards.innerHTML = categories.map(function (c) {
      return '<div class="col-4 col-md-3 col-lg-2"><div class="cat-card" data-cat="' + c.id + '"><div class="ico">' + (c.icon || "📦") + '</div><div class="name">' + escapeHtml(c.name) + "</div></div></div>";
    }).join("");
    cards.querySelectorAll(".cat-card").forEach(function (el) {
      el.onclick = function () { setCategory(el.dataset.cat); document.getElementById("productsSection").scrollIntoView({ behavior: "smooth" }); };
    });
  }
  if (filterCat) {
    filterCat.innerHTML = '<option value="all">همه</option>' + categories.map(function (c) {
      return '<option value="' + c.id + '">' + escapeHtml(c.name) + "</option>";
    }).join("");
    filterCat.value = currentCategory;
  }
}
function filteredProducts() {
  var list = products.slice();
  if (currentCategory !== "all") {
    var cat = categories.find(function (c) { return c.id === currentCategory; });
    list = list.filter(function (p) {
      return p.categoryId === currentCategory || (p.category || "").indexOf(cat ? cat.name : "___") !== -1;
    });
  }
  if (currentSearch.trim()) {
    var q = currentSearch.trim().toLowerCase();
    list = list.filter(function (p) {
      return (p.name || "").toLowerCase().indexOf(q) !== -1 || (p.description || "").toLowerCase().indexOf(q) !== -1 || (p.category || "").toLowerCase().indexOf(q) !== -1;
    });
  }
  if (priceMin != null && !isNaN(priceMin)) list = list.filter(function (p) { return p.finalPrice >= priceMin; });
  if (priceMax != null && !isNaN(priceMax) && priceMax > 0) list = list.filter(function (p) { return p.finalPrice <= priceMax; });
  if (stockFilter === "in") list = list.filter(function (p) { return p.totalStock > 0; });
  else if (stockFilter === "out") list = list.filter(function (p) { return p.totalStock <= 0; });
  else if (stockFilter === "featured") list = list.filter(function (p) { return p.featured; });
  else if (stockFilter === "discount") list = list.filter(function (p) { return p.discountPercent > 0 && p.compareAtPrice > p.finalPrice; });
  if (currentSort === "price-asc") list.sort(function (a, b) { return a.finalPrice - b.finalPrice; });
  else if (currentSort === "price-desc") list.sort(function (a, b) { return b.finalPrice - a.finalPrice; });
  else if (currentSort === "discount") list.sort(function (a, b) { return (b.discountPercent || 0) - (a.discountPercent || 0); });
  else list.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return list;
}
function productCardHtml(p) {
  var out = p.totalStock <= 0, disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice;
  return '<div class="col-6 col-md-4 col-xl-3"><article class="product-card" data-id="' + p.id + '">' +
    '<div class="product-img">' + (p.image ? '<img src="' + p.image + '" alt="' + escapeHtml(p.name) + '" loading="lazy" width="300" height="300" />' : '') +
    (disc ? '<span class="disc-badge">' + p.discountPercent + '٪</span>' : '') + '</div>' +
    '<div class="product-body"><div class="product-cat">' + escapeHtml(p.category || 'عمومی') + '</div>' +
    '<div class="product-title">' + escapeHtml(p.name) + '</div>' +
    '<div class="product-price"><div class="price-col"><span class="old-price">' + (disc ? money(p.compareAtPrice) : '') +
    '</span><span class="final-price">' + money(p.finalPrice) + '</span></div>' +
    '<button type="button" class="btn-add" data-add="' + p.id + '"' + (out ? ' disabled' : '') + '><i class="bi bi-plus-lg"></i></button></div></div></article></div>';
}
function bindCards(root) {
  root.querySelectorAll('.product-card').forEach(function (card) {
    card.addEventListener('click', function (e) { if (e.target.closest('[data-add]')) return; openProduct(card.dataset.id); });
  });
  root.querySelectorAll('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); quickAdd(btn.dataset.add); });
  });
}
function renderProducts() {
  var grid = document.getElementById('productsGrid'); if (!grid) return;
  var list = filteredProducts();
  var info = document.getElementById('resultInfo');
  if (info) info.textContent = list.length.toLocaleString('fa-IR') + ' محصول';
  if (!list.length) { grid.innerHTML = '<div class="col-12"><div class="empty-state">محصولی با این فیلتر پیدا نشد</div></div>'; return; }
  grid.innerHTML = list.map(productCardHtml).join('');
  bindCards(grid);
}
function renderSpecials() {
  var row = document.getElementById('specialsRow'); if (!row) return;
  var specials = products.filter(function (p) { return p.featured || (p.discountPercent > 0 && p.compareAtPrice > p.finalPrice); });
  if (!specials.length) specials = products.slice(0, 8);
  if (!specials.length) { row.innerHTML = '<div class="text-muted small p-2">موردی نیست</div>'; return; }
  row.innerHTML = specials.map(function (p) {
    var out = p.totalStock <= 0, disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice;
    return '<article class="product-card" data-id="' + p.id + '"><div class="product-img">' +
      (p.image ? '<img src="' + p.image + '" alt="" loading="lazy" width="200" height="200" />' : '') +
      (disc ? '<span class="disc-badge">' + p.discountPercent + '٪</span>' : '') + '</div>' +
      '<div class="product-body"><div class="product-title">' + escapeHtml(p.name) + '</div>' +
      '<div class="product-price"><div class="price-col"><span class="old-price">' + (disc ? money(p.compareAtPrice) : '') +
      '</span><span class="final-price">' + money(p.finalPrice) + '</span></div>' +
      '<button type="button" class="btn-add" data-add="' + p.id + '"' + (out ? ' disabled' : '') + '><i class="bi bi-plus-lg"></i></button></div></div></article>';
  }).join('');
  bindCards(row);
}
function openProduct(id) {
  var p = products.find(function (x) { return x.id === id; }); if (!p) return;
  selectedProduct = p; selectedAttributes = {}; selectedQuantity = 1;
  Object.keys(p.attributes || {}).forEach(function (k) {
    var vals = p.attributes[k]; if (Array.isArray(vals) && vals.length) selectedAttributes[k] = vals[0];
  });
  renderProductModal(); if (productModal) productModal.show();
}
function findSelectedVariant() {
  var p = selectedProduct; if (!p || !p.variants.length) return null;
  return p.variants.find(function (v) {
    var a = v.attributes || {};
    return Object.keys(selectedAttributes).every(function (k) { return a[k] === selectedAttributes[k]; });
  }) || null;
}
function renderProductModal() {
  var p = selectedProduct; if (!p) return;
  var variant = findSelectedVariant();
  var price = (variant && variant.price) || p.finalPrice;
  var stock = variant ? Number(variant.stock || 0) : p.totalStock;
  var out = stock <= 0, disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice;
  var attrHtml = Object.keys(p.attributes || {}).map(function (key) {
    var vals = p.attributes[key] || [];
    return '<div class="mb-2"><label class="form-label small fw-bold">' + escapeHtml(key) + '</label><div class="d-flex flex-wrap gap-2">' +
      vals.map(function (v) {
        return '<button type="button" class="v-opt ' + (selectedAttributes[key] === v ? 'active' : '') + '" data-attr="' + escapeHtml(key) + '" data-val="' + escapeHtml(v) + '">' + escapeHtml(v) + '</button>';
      }).join('') + '</div></div>';
  }).join('');
  document.getElementById('productBox').innerHTML =
    '<div class="modal-header border-0 pb-0"><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
    '<div class="modal-body pt-0"><div class="row g-3"><div class="col-md-6 text-center">' +
    (p.image ? '<img class="modal-product-img" src="' + p.image + '" alt="" />' : '') +
    '</div><div class="col-md-6"><div class="text-muted small mb-1">' + escapeHtml(p.category || '') + '</div>' +
    '<h4 class="mb-2">' + escapeHtml(p.name) + '</h4>' +
    (disc ? '<div class="text-decoration-line-through text-muted small">' + money(p.compareAtPrice) + '</div>' : '') +
    '<div class="fs-4 fw-bold mb-2">' + money(price) + (disc ? ' <span class="badge text-bg-danger">' + p.discountPercent + '٪</span>' : '') + '</div>' +
    (p.description ? '<p class="small text-muted">' + escapeHtml(p.description) + '</p>' : '') + attrHtml +
    '<div class="d-flex align-items-center gap-2 my-3">' +
    '<button type="button" class="btn btn-outline-secondary btn-sm" id="qtyMinus">−</button>' +
    '<span class="fw-bold" id="qtyVal">' + selectedQuantity + '</span>' +
    '<button type="button" class="btn btn-outline-secondary btn-sm" id="qtyPlus">+</button>' +
    '<span class="small text-muted">موجودی: ' + stock + '</span></div>' +
    '<button type="button" class="btn btn-dk w-100" id="addToCartBtn"' + (out ? ' disabled' : '') + '>' + (out ? 'ناموجود' : 'افزودن به سبد') +
    '</button></div></div></div>';
  document.querySelectorAll('.v-opt').forEach(function (btn) {
    btn.onclick = function () { selectedAttributes[btn.dataset.attr] = btn.dataset.val; renderProductModal(); };
  });
  document.getElementById('qtyMinus').onclick = function () {
    selectedQuantity = Math.max(1, selectedQuantity - 1); document.getElementById('qtyVal').textContent = selectedQuantity;
  };
  document.getElementById('qtyPlus').onclick = function () {
    selectedQuantity = Math.min(stock || 99, selectedQuantity + 1); document.getElementById('qtyVal').textContent = selectedQuantity;
  };
  document.getElementById('addToCartBtn').onclick = function () { addToCart(p, variant, selectedQuantity); if (productModal) productModal.hide(); };
}
function quickAdd(id) {
  var p = products.find(function (x) { return x.id === id; }); if (!p) return;
  if (p.variants && p.variants.length) { openProduct(id); return; }
  if (p.totalStock <= 0) { toast('این محصول ناموجود است', 'err'); return; }
  addToCart(p, null, 1);
}
function addToCart(product, variant, qty) {
  var key = product.id + '::' + ((variant && variant.id) || '');
  var existing = cart.find(function (i) { return i.key === key; });
  if (existing) existing.quantity += qty;
  else cart.push({ key: key, productId: product.id, variantId: (variant && variant.id) || null, name: product.name, variantName: (variant && variant.name) || '', image: product.image, unitPrice: (variant && variant.price) || product.finalPrice, quantity: qty });
  saveCart(); updateCartUI(); toast('به سبد اضافه شد', 'ok');
}
function updateCartUI() {
  var count = cart.reduce(function (s, i) { return s + i.quantity; }, 0);
  var total = cart.reduce(function (s, i) { return s + i.unitPrice * i.quantity; }, 0);
  var badge = document.getElementById('cartCount');
  if (badge) {
    if (count > 0) { badge.textContent = count.toLocaleString('fa-IR'); badge.classList.remove('d-none'); }
    else badge.classList.add('d-none');
  }
  var ct = document.getElementById('cartTotal'); if (ct) ct.textContent = money(total);
  var box = document.getElementById('cartItems'); if (!box) return;
  var checkoutBtn = document.getElementById('checkoutBtn');
  if (!cart.length) {
    box.innerHTML = '<div class="text-center text-muted py-5">سبد خرید خالی است</div>';
    if (checkoutBtn) checkoutBtn.disabled = true; return;
  }
  if (checkoutBtn) checkoutBtn.disabled = false;
  box.innerHTML = cart.map(function (item, idx) {
    return '<div class="c-item"><img src="' + (item.image || '') + '" alt="" loading="lazy" /><div><div class="c-title">' + escapeHtml(item.name) + '</div>' +
      (item.variantName ? '<div class="c-var">' + escapeHtml(item.variantName) + '</div>' : '') +
      '<div class="c-price">' + money(item.unitPrice) + '</div><div class="c-qty mt-1">' +
      '<button type="button" data-dec="' + idx + '">−</button><span>' + item.quantity + '</span><button type="button" data-inc="' + idx + '">+</button></div></div>' +
      '<button type="button" class="btn btn-link text-danger btn-sm p-0" data-rm="' + idx + '">حذف</button></div>';
  }).join('');
  box.querySelectorAll('[data-inc]').forEach(function (b) { b.onclick = function () { cart[+b.dataset.inc].quantity++; saveCart(); updateCartUI(); }; });
  box.querySelectorAll('[data-dec]').forEach(function (b) {
    b.onclick = function () { var i = +b.dataset.dec; cart[i].quantity--; if (cart[i].quantity <= 0) cart.splice(i, 1); saveCart(); updateCartUI(); };
  });
  box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { cart.splice(+b.dataset.rm, 1); saveCart(); updateCartUI(); }; });
}
function openCheckout() {
  if (!cart.length) return;
  var total = cart.reduce(function (s, i) { return s + i.unitPrice * i.quantity; }, 0);
  var count = cart.reduce(function (s, i) { return s + i.quantity; }, 0);
  document.getElementById('checkoutItemsCount').textContent = count.toLocaleString('fa-IR');
  document.getElementById('checkoutTotal').textContent = money(total);
  fillCustomerForm();
  if (checkoutModal) checkoutModal.show();
}
async function submitOrder(e) {
  e.preventDefault();
  var name = document.getElementById('customerName').value.trim();
  var phone = document.getElementById('customerPhone').value.trim();
  var address = document.getElementById('customerAddress').value.trim();
  var note = document.getElementById('customerNote').value.trim();
  if (!name || !phone || !address) { toast('لطفاً همه فیلدهای الزامی را پر کنید', 'err'); return; }
  saveCustomer({ name: name, phone: phone, address: address, note: note });
  var items = cart.map(function (i) {
    return { productId: i.productId, variantId: i.variantId, name: i.name, variantName: i.variantName, unitPrice: i.unitPrice, quantity: i.quantity, image: i.image };
  });
  var total = items.reduce(function (s, i) { return s + i.unitPrice * i.quantity; }, 0);
  var btn = document.getElementById('submitOrderBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'در حال ثبت...'; }
  try {
    var res = await fetchWithTimeout(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'orders.create',
        payload: { customer: { name: name, phone: phone, address: address, note: note }, items: items, total: total }
      })
    }, 12000);
    var data = await res.json();
    if (!data || !data.ok) throw new Error((data && data.error) || 'خطا در ثبت سفارش');
    lastOrderId = (data.result && data.result.id) || data.orderId || null;
    cart = []; saveCart(); updateCartUI();
    if (checkoutModal) checkoutModal.hide();
    document.getElementById('successMsg').textContent = 'سفارش شما با موفقیت ثبت شد.\nکد سفارش: ' + (lastOrderId || '—');
    var bale = document.getElementById('baleOpenBtn');
    if (bale && lastOrderId) bale.href = BALE_BOT_URL + '?start=order_' + encodeURIComponent(lastOrderId);
    if (successModal) successModal.show();
    toast('سفارش ثبت شد', 'ok');
  } catch (err) {
    console.error(err);
    toast(err.message || 'خطا در ثبت سفارش', 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'تأیید نهایی سفارش'; }
  }
}
function openBale(orderId) {
  var url = BALE_BOT_URL + (orderId ? ('?start=order_' + encodeURIComponent(orderId)) : '');
  window.open(url, '_blank', 'noopener');
}
function applyFilters() {
  currentSort = document.getElementById('sortSelect').value;
  currentCategory = document.getElementById('filterCategory').value;
  var mn = document.getElementById('priceMin').value;
  var mx = document.getElementById('priceMax').value;
  priceMin = mn === '' ? null : Number(mn);
  priceMax = mx === '' ? null : Number(mx);
  stockFilter = document.getElementById('filterStock').value;
  document.querySelectorAll('.cat-pill').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.cat === currentCategory); });
  renderProducts();
}
function resetFilters() {
  document.getElementById('sortSelect').value = 'newest';
  document.getElementById('filterCategory').value = 'all';
  document.getElementById('priceMin').value = '';
  document.getElementById('priceMax').value = '';
  document.getElementById('filterStock').value = 'all';
  document.getElementById('searchInput').value = '';
  currentSearch = ''; currentSort = 'newest'; currentCategory = 'all'; priceMin = null; priceMax = null; stockFilter = 'all';
  document.querySelectorAll('.cat-pill').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.cat === 'all'); });
  renderProducts();
}
document.addEventListener('DOMContentLoaded', function () {
  if (window.bootstrap) {
    productModal = new bootstrap.Modal(document.getElementById('productModal'));
    checkoutModal = new bootstrap.Modal(document.getElementById('checkoutModal'));
    successModal = new bootstrap.Modal(document.getElementById('successModal'));
    cartOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('cartDrawer'));
  }
  var checkoutBtn = document.getElementById('checkoutBtn'); if (checkoutBtn) checkoutBtn.onclick = openCheckout;
  var form = document.getElementById('checkoutForm'); if (form) form.addEventListener('submit', submitOrder);
  var bale = document.getElementById('baleOpenBtn');
  if (bale) bale.addEventListener('click', function (e) { e.preventDefault(); openBale(lastOrderId); });
  var search = document.getElementById('searchInput');
  if (search) search.addEventListener('input', function (e) { currentSearch = e.target.value; renderProducts(); });
  var sort = document.getElementById('sortSelect'); if (sort) sort.addEventListener('change', applyFilters);
  var apply = document.getElementById('applyFiltersBtn'); if (apply) apply.onclick = applyFilters;
  var reset = document.getElementById('resetFiltersBtn'); if (reset) reset.onclick = resetFilters;
  var discBtn = document.getElementById('showDiscountedBtn');
  if (discBtn) discBtn.onclick = function () {
    document.getElementById('filterStock').value = 'discount'; stockFilter = 'discount'; applyFilters();
    document.getElementById('productsSection').scrollIntoView({ behavior: 'smooth' });
  };
  ['customerName', 'customerPhone', 'customerAddress', 'customerNote'].forEach(function (id) {
    var el = document.getElementById(id); if (!el) return;
    el.addEventListener('change', function () {
      saveCustomer({
        name: document.getElementById('customerName').value.trim(),
        phone: document.getElementById('customerPhone').value.trim(),
        address: document.getElementById('customerAddress').value.trim(),
        note: document.getElementById('customerNote').value.trim()
      });
    });
  });
  fillCustomerForm();
  loadData();
});
