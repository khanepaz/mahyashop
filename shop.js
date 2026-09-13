const API_URL = "https://hamedtest1.netlify.app/.netlify/functions/api";
const PRODUCTS_FALLBACK = "data/products.json";
const CATEGORIES_FALLBACK = "data/categories.json";
const BALE_BOT_URL = "https://ble.ir/Hamedtestshop_bot";
const API_TIMEOUT_MS = 4000;

let products = [];
let categories = [];
let cart = loadCart();
let currentCategory = "all";
let currentSearch = "";
let currentSort = "newest";
let selectedProduct = null;
let selectedAttributes = {};
let selectedQuantity = 1;
let lastOrderId = null;

function money(n) {
  return Math.round(Number(n) || 0).toLocaleString("fa-IR") + " تومان";
}
function toast(msg, type) {
  var el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.className = "toast show " + (type || "");
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { el.className = "toast"; }, 2800);
}
function loadCart() {
  try { return JSON.parse(localStorage.getItem("hs_cart") || "[]"); } catch (e) { return []; }
}
function saveCart() { localStorage.setItem("hs_cart", JSON.stringify(cart)); }
function loadCustomer() {
  try { return JSON.parse(localStorage.getItem("hs_customer") || "{}"); } catch (e) { return {}; }
}
function saveCustomer(data) {
  localStorage.setItem("hs_customer", JSON.stringify(data || {}));
}
function fillCustomerForm() {
  var c = loadCustomer();
  var n = document.getElementById("customerName");
  if (!n) return;
  if (c.name) n.value = c.name;
  if (c.phone) document.getElementById("customerPhone").value = c.phone;
  if (c.address) document.getElementById("customerAddress").value = c.address;
  if (c.note) document.getElementById("customerNote").value = c.note;
}
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&" + "amp;").replace(/</g, "&" + "lt;").replace(/>/g, "&" + "gt;").replace(/"/g, "&" + "quot;");
}
function fetchWithTimeout(url, options, ms) {
  var controller = new AbortController();
  var timer = setTimeout(function () { controller.abort(); }, ms || API_TIMEOUT_MS);
  var opts = Object.assign({}, options || {}, { signal: controller.signal });
  return fetch(url, opts).finally(function () { clearTimeout(timer); });
}
function normalizeProduct(p) {
  var images = Array.isArray(p.images) && p.images.length ? p.images : (p.image ? [p.image] : []);
  var compareAt = Number(p.compareAtPrice != null ? p.compareAtPrice : (p.price || 0));
  var final = Number(p.finalPrice != null ? p.finalPrice : (p.price || 0));
  return Object.assign({}, p, {
    images: images, image: images[0] || "", compareAtPrice: compareAt, finalPrice: final, price: final,
    discountPercent: Number(p.discountPercent || 0),
    totalStock: Number(p.totalStock != null ? p.totalStock : (p.stock || 0)),
    variants: Array.isArray(p.variants) ? p.variants : [], active: p.active !== false
  });
}
async function loadLocalProducts() {
  try {
    var res = await fetch(PRODUCTS_FALLBACK, { cache: "default" });
    if (!res.ok) return false;
    var data = await res.json();
    var list = Array.isArray(data) ? data : (data.products || []);
    products = list.map(normalizeProduct).filter(function (p) { return p.active !== false; });
    return products.length > 0;
  } catch (e) { return false; }
}
async function loadLocalCategories() {
  try {
    var res = await fetch(CATEGORIES_FALLBACK, { cache: "default" });
    if (!res.ok) return false;
    var data = await res.json();
    categories = (Array.isArray(data) ? data : []).filter(function (c) { return c.active !== false; });
    return true;
  } catch (e) { return false; }
}
async function loadApiProducts() {
  var res = await fetchWithTimeout(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "products.list" }), cache: "no-store" }, API_TIMEOUT_MS);
  var data = await res.json();
  if (data && data.ok && Array.isArray(data.result)) {
    products = data.result.map(normalizeProduct).filter(function (p) { return p.active !== false; });
    return true;
  }
  return false;
}
async function loadApiCategories() {
  var res = await fetchWithTimeout(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "categories.list" }), cache: "no-store" }, API_TIMEOUT_MS);
  var data = await res.json();
  if (data && data.ok && Array.isArray(data.result)) {
    categories = data.result.filter(function (c) { return c.active !== false; });
    return true;
  }
  return false;
}
async function loadData() {
  var grid = document.getElementById("productsGrid");
  if (grid) grid.innerHTML = '<div class="state"><div class="spinner"></div><div>در حال بارگذاری...</div></div>';
  await Promise.all([loadLocalProducts(), loadLocalCategories()]);
  if (products.length) { renderCategories(); renderProducts(); updateCartUI(); }
  try {
    var okP = await loadApiProducts();
    var okC = await loadApiCategories();
    if (okP || okC) { renderCategories(); renderProducts(); updateCartUI(); }
  } catch (e) { console.warn(e); }
  if (!products.length && grid) grid.innerHTML = '<div class="state">محصولی نیست</div>';
  updateCartUI();
}
function renderCategories() {
  var el = document.getElementById("categoryList");
  if (!el) return;
  var items = [{ id: "all", name: "همه", icon: "✨" }].concat(categories);
  el.innerHTML = items.map(function (c) {
    return '<button class="cat-btn ' + (currentCategory === c.id ? "active" : "") + '" data-cat="' + c.id + '">' + ((c.icon || "") + " ") + c.name + "</button>";
  }).join("");
  el.querySelectorAll(".cat-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { currentCategory = btn.dataset.cat; renderCategories(); renderProducts(); });
  });
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
  if (currentSort === "price-asc") list.sort(function (a, b) { return a.finalPrice - b.finalPrice; });
  else if (currentSort === "price-desc") list.sort(function (a, b) { return b.finalPrice - a.finalPrice; });
  else if (currentSort === "discount") list.sort(function (a, b) { return (b.discountPercent || 0) - (a.discountPercent || 0); });
  else list.sort(function (a, b) { return String(b.createdAt || "").localeCompare(String(a.createdAt || "")); });
  return list;
}
function renderProducts() {
  var grid = document.getElementById("productsGrid");
  if (!grid) return;
  var list = filteredProducts();
  var info = document.getElementById("resultInfo");
  if (info) info.textContent = list.length.toLocaleString("fa-IR") + " محصول";
  if (!list.length) { grid.innerHTML = '<div class="state">محصولی پیدا نشد</div>'; return; }
  grid.innerHTML = list.map(function (p) {
    var out = p.totalStock <= 0;
    var disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice;
    return '<article class="card" data-id="' + p.id + '"><div class="card-img">' +
      (p.image ? '<img src="' + p.image + '" alt="' + escapeHtml(p.name) + '" loading="lazy" />' : '') +
      (disc ? '<span class="card-disc">' + p.discountPercent + '٪</span>' : '') +
      '</div><div class="card-body"><div class="card-cat">' + escapeHtml(p.category || 'عمومی') + '</div>' +
      '<div class="card-title">' + escapeHtml(p.name) + '</div><div class="card-row"><div class="price-col">' +
      '<span class="old-price">' + (disc ? money(p.compareAtPrice) : '') + '</span>' +
      '<span class="final-price">' + money(p.finalPrice) + '</span></div>' +
      '<button class="add-btn" data-add="' + p.id + '"' + (out ? ' disabled' : '') + '>+</button></div></div></article>';
  }).join('');
  grid.querySelectorAll('.card').forEach(function (card) {
    card.addEventListener('click', function (e) { if (e.target.closest('[data-add]')) return; openProduct(card.dataset.id); });
  });
  grid.querySelectorAll('[data-add]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); quickAdd(btn.dataset.add); });
  });
}
function openProduct(id) {
  var p = products.find(function (x) { return x.id === id; });
  if (!p) return;
  selectedProduct = p; selectedAttributes = {}; selectedQuantity = 1;
  Object.keys(p.attributes || {}).forEach(function (k) {
    var vals = p.attributes[k];
    if (Array.isArray(vals) && vals.length) selectedAttributes[k] = vals[0];
  });
  renderProductModal();
  var m = document.getElementById('productModal');
  if (m) m.classList.add('open');
}
function closeProduct() {
  var m = document.getElementById('productModal');
  if (m) m.classList.remove('open');
  selectedProduct = null;
}
function findSelectedVariant() {
  var p = selectedProduct;
  if (!p || !p.variants.length) return null;
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
  var out = stock <= 0;
  var disc = p.discountPercent > 0 && p.compareAtPrice > p.finalPrice;
  var attrHtml = Object.keys(p.attributes || {}).map(function (key) {
    var vals = p.attributes[key] || [];
    return '<div class="variant-group"><label>' + escapeHtml(key) + '</label><div class="variant-opts">' +
      vals.map(function (v) {
        return '<button type="button" class="v-opt ' + (selectedAttributes[key] === v ? 'active' : '') +
          '" data-attr="' + escapeHtml(key) + '" data-val="' + escapeHtml(v) + '">' + escapeHtml(v) + '</button>';
      }).join('') + '</div></div>';
  }).join('');
  var box = document.getElementById('productBox');
  if (!box) return;
  box.innerHTML = '<div class="modal-layout"><div class="modal-img">' +
    (p.image ? '<img src="' + p.image + '" alt="" />' : '') +
    '<button class="modal-close" id="productClose">✕</button></div><div class="modal-info">' +
    '<div class="modal-cat">' + escapeHtml(p.category || '') + '</div><h2>' + escapeHtml(p.name) + '</h2>' +
    '<div class="modal-price-block">' + (disc ? '<div class="modal-old">' + money(p.compareAtPrice) + '</div>' : '') +
    '<div class="modal-final">' + money(price) + (disc ? ' <span class="disc-tag">' + p.discountPercent + '٪</span>' : '') + '</div></div>' +
    (p.description ? '<p style="font-size:13px;color:#666;margin-bottom:14px">' + escapeHtml(p.description) + '</p>' : '') +
    attrHtml + '<div class="qty-row"><button class="qty-btn" id="qtyMinus">−</button><span class="qty-val" id="qtyVal">' +
    selectedQuantity + '</span><button class="qty-btn" id="qtyPlus">+</button>' +
    '<span style="font-size:12px;color:#888;margin-right:8px">موجودی: ' + stock + '</span></div>' +
    '<button class="primary-btn" id="addToCartBtn"' + (out ? ' disabled' : '') + '>' + (out ? 'ناموجود' : 'افزودن به سبد') + '</button></div></div>';
  document.getElementById('productClose').onclick = closeProduct;
  var ov = document.getElementById('productOverlay'); if (ov) ov.onclick = closeProduct;
  document.querySelectorAll('.v-opt').forEach(function (btn) {
    btn.onclick = function () { selectedAttributes[btn.dataset.attr] = btn.dataset.val; renderProductModal(); };
  });
  document.getElementById('qtyMinus').onclick = function () {
    selectedQuantity = Math.max(1, selectedQuantity - 1);
    document.getElementById('qtyVal').textContent = selectedQuantity;
  };
  document.getElementById('qtyPlus').onclick = function () {
    selectedQuantity = Math.min(stock || 99, selectedQuantity + 1);
    document.getElementById('qtyVal').textContent = selectedQuantity;
  };
  document.getElementById('addToCartBtn').onclick = function () { addToCart(p, variant, selectedQuantity); closeProduct(); };
}
function quickAdd(id) {
  var p = products.find(function (x) { return x.id === id; });
  if (!p) return;
  if (p.variants && p.variants.length) { openProduct(id); return; }
  if (p.totalStock <= 0) { toast('ناموجود', 'err'); return; }
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
    if (count > 0) { badge.textContent = count.toLocaleString('fa-IR'); badge.classList.remove('hidden'); }
    else badge.classList.add('hidden');
  }
  var ct = document.getElementById('cartTotal'); if (ct) ct.textContent = money(total);
  var box = document.getElementById('cartItems'); if (!box) return;
  var checkoutBtn = document.getElementById('checkoutBtn');
  if (!cart.length) {
    box.innerHTML = '<div class="cart-empty">سبد خالی است</div>';
    if (checkoutBtn) checkoutBtn.disabled = true; return;
  }
  if (checkoutBtn) checkoutBtn.disabled = false;
  box.innerHTML = cart.map(function (item, idx) {
    return '<div class="c-item"><img src="' + (item.image || '') + '" alt="" /><div><div class="c-title">' + escapeHtml(item.name) + '</div>' +
      (item.variantName ? '<div class="c-var">' + escapeHtml(item.variantName) + '</div>' : '') +
      '<div class="c-price">' + money(item.unitPrice) + '</div></div><div class="c-ctrl"><div class="c-qty">' +
      '<button data-dec="' + idx + '">−</button><span>' + item.quantity + '</span><button data-inc="' + idx + '">+</button></div>' +
      '<button class="c-remove" data-rm="' + idx + '">حذف</button></div></div>';
  }).join('');
  box.querySelectorAll('[data-inc]').forEach(function (b) { b.onclick = function () { cart[+b.dataset.inc].quantity++; saveCart(); updateCartUI(); }; });
  box.querySelectorAll('[data-dec]').forEach(function (b) {
    b.onclick = function () { var i = +b.dataset.dec; cart[i].quantity--; if (cart[i].quantity <= 0) cart.splice(i, 1); saveCart(); updateCartUI(); };
  });
  box.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { cart.splice(+b.dataset.rm, 1); saveCart(); updateCartUI(); }; });
}
function openCart() {
  var o = document.getElementById('cartOverlay'); var d = document.getElementById('cartDrawer');
  if (o) o.classList.add('open'); if (d) d.classList.add('open');
}
function closeCart() {
  var o = document.getElementById('cartOverlay'); var d = document.getElementById('cartDrawer');
  if (o) o.classList.remove('open'); if (d) d.classList.remove('open');
}
function openCheckout() {
  if (!cart.length) return;
  var total = cart.reduce(function (s, i) { return s + i.unitPrice * i.quantity; }, 0);
  var count = cart.reduce(function (s, i) { return s + i.quantity; }, 0);
  var a = document.getElementById('checkoutItemsCount'); if (a) a.textContent = count.toLocaleString('fa-IR');
  var b = document.getElementById('checkoutTotal'); if (b) b.textContent = money(total);
  fillCustomerForm();
  var m = document.getElementById('checkoutModal'); if (m) m.classList.add('open');
  closeCart();
}
function closeCheckout() { var m = document.getElementById('checkoutModal'); if (m) m.classList.remove('open'); }
function baleOrderUrl(orderId) {
  var base = BALE_BOT_URL.replace(/\/$/, '');
  if (orderId) return base + '?start=order_' + encodeURIComponent(orderId);
  return base;
}
function openBale(orderId) {
  var url = baleOrderUrl(orderId);
  window.location.href = url;
  setTimeout(function () { window.open(url, '_blank', 'noopener'); }, 500);
}
function showSuccess(order) {
  lastOrderId = (order && order.id) || null;
  var msg = document.getElementById('successMsg');
  if (msg) msg.textContent = lastOrderId ? ('کد سفارش: ' + lastOrderId + '\nربات بله را باز کنید.') : 'سفارش ثبت شد.';
  var btn = document.getElementById('baleOpenBtn'); if (btn) btn.href = baleOrderUrl(lastOrderId);
  var m = document.getElementById('successModal'); if (m) m.classList.add('open');
  setTimeout(function () { openBale(lastOrderId); }, 700);
}
async function submitOrder(e) {
  e.preventDefault();
  if (!cart.length) { toast('سبد خالی است', 'err'); return; }
  var name = document.getElementById('customerName').value.trim();
  var phone = document.getElementById('customerPhone').value.trim();
  var address = document.getElementById('customerAddress').value.trim();
  var note = document.getElementById('customerNote').value.trim();
  if (!name || !phone || !address) { toast('اطلاعات ناقص', 'err'); return; }
  var btn = document.getElementById('submitOrderBtn');
  btn.disabled = true; btn.textContent = 'در حال ثبت...';
  try {
    var res = await fetchWithTimeout(API_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'orders.create', customer: { name: name, phone: phone, address: address }, note: note,
        items: cart.map(function (i) { return { productId: i.productId, variantId: i.variantId, quantity: i.quantity }; }) })
    }, 15000);
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || data.message || 'خطا');
    saveCustomer({ name: name, phone: phone, address: address, note: note });
    cart = []; saveCart(); updateCartUI(); closeCheckout();
    document.getElementById('checkoutForm').reset(); fillCustomerForm();
    showSuccess(data.result); loadData();
  } catch (err) { toast(err.message || 'خطا', 'err'); }
  finally { btn.disabled = false; btn.textContent = 'تأیید نهایی سفارش'; }
}

var cartBtn = document.getElementById('cartBtn'); if (cartBtn) cartBtn.onclick = openCart;
var cartClose = document.getElementById('cartClose'); if (cartClose) cartClose.onclick = closeCart;
var cartOverlay = document.getElementById('cartOverlay'); if (cartOverlay) cartOverlay.onclick = closeCart;
var checkoutBtn = document.getElementById('checkoutBtn'); if (checkoutBtn) checkoutBtn.onclick = openCheckout;
var checkoutClose = document.getElementById('checkoutClose'); if (checkoutClose) checkoutClose.onclick = closeCheckout;
var checkoutForm = document.getElementById('checkoutForm'); if (checkoutForm) checkoutForm.addEventListener('submit', submitOrder);
var baleOpenBtn = document.getElementById('baleOpenBtn');
if (baleOpenBtn) baleOpenBtn.addEventListener('click', function (e) { e.preventDefault(); openBale(lastOrderId); });
var successClose = document.getElementById('successClose');
if (successClose) successClose.onclick = function () { var m = document.getElementById('successModal'); if (m) m.classList.remove('open'); };
var searchInput = document.getElementById('searchInput');
if (searchInput) searchInput.addEventListener('input', function (e) { currentSearch = e.target.value; renderProducts(); });
var sortSelect = document.getElementById('sortSelect');
if (sortSelect) sortSelect.addEventListener('change', function (e) { currentSort = e.target.value; renderProducts(); });
fillCustomerForm();
loadData();
