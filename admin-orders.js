/* Order management enhancements — loaded after admin.js */
(function () {
  var _origApi = typeof api === "function" ? api : null;
  if (_origApi) {
    api = async function (action, body, useAuth) {
      try {
        return await _origApi(action, body, useAuth);
      } catch (e) {
        var msg = (e && e.message) || String(e);
        if (/Failed to fetch|NetworkError|ERR_|fetch/i.test(msg) || msg.indexOf("ارتباط") !== -1) {
          throw new Error("ارتباط با سرور برقرار نشد. برای تغییر وضعیت/پرداخت فیلترشکن را روشن کنید (API روی نتلیفای).");
        }
        throw e;
      }
    };
  }

  function renderOrders() {
    const sf = document.getElementById("orderStatusFilter").value;
    const pf = document.getElementById("orderPayFilter").value;
    let list = cache.orders.slice().reverse();
    if (sf !== "all") list = list.filter(function (o) { return o.status === sf; });
    if (pf === "paid") list = list.filter(function (o) { return o.paymentStatus === "paid"; });
    if (pf === "unpaid") list = list.filter(function (o) { return o.paymentStatus !== "paid"; });
    if (!list.length) {
      document.getElementById("ordersTableWrap").innerHTML =
        '<div class="empty-hint">سفارشی با این فیلتر نیست<br/><span class="form-hint">اگر سفارش ثبت کرده‌اید و اینجا خالی است، «بروزرسانی» را بزنید. برای تغییر وضعیت نیاز به دسترسی API (نتلیفای) است.</span></div>';
      return;
    }
    document.getElementById("ordersTableWrap").innerHTML =
      '<table class="table table-adm table-hover"><thead><tr>' +
      "<th>کد</th><th>مشتری</th><th>مبلغ</th><th>وضعیت</th><th>پرداخت</th><th>تاریخ</th><th></th></tr></thead><tbody>" +
      list
        .map(function (o) {
          var date = "";
          try {
            date = o.createdAt ? new Date(o.createdAt).toLocaleString("fa-IR") : "";
          } catch (e) {}
          return (
            "<tr><td class=\"small\">" +
            escapeHtml(o.id) +
            "</td><td>" +
            escapeHtml((o.customer && o.customer.name) || "—") +
            '<div class="small text-muted">' +
            escapeHtml((o.customer && o.customer.phone) || "") +
            "</div></td><td>" +
            money(o.total) +
            "</td><td>" +
            escapeHtml(STATUS_LABELS[o.status] || o.status || "—") +
            "</td><td>" +
            (o.paymentStatus === "paid"
              ? '<span class="badge-soft badge-paid">پرداخت شده</span>'
              : '<span class="badge-soft badge-unpaid">نشده</span>') +
            '</td><td class="small text-muted">' +
            escapeHtml(date) +
            '</td><td><button type="button" class="btn btn-sm btn-adm" data-oid="' +
            escapeHtml(o.id) +
            '">مدیریت</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table>";
    document.querySelectorAll("[data-oid]").forEach(function (b) {
      b.onclick = function () {
        openOrder(b.dataset.oid);
      };
    });
  }

  function openOrder(id) {
    const o = cache.orders.find(function (x) {
      return x.id === id;
    });
    if (!o) {
      toast("سفارش پیدا نشد", "err");
      return;
    }
    const c = o.customer || {};
    const items = (o.items || [])
      .map(function (i) {
        return (
          "<li>" +
          escapeHtml(i.name) +
          (i.variantName ? " (" + escapeHtml(i.variantName) + ")" : "") +
          " × " +
          i.quantity +
          " = " +
          money(i.total) +
          "</li>"
        );
      })
      .join("");
    var date = "";
    try {
      date = o.createdAt ? new Date(o.createdAt).toLocaleString("fa-IR") : "";
    } catch (e) {}
    document.getElementById("orderDetailBody").innerHTML =
      '<div class="mb-2"><strong>کد سفارش:</strong> <code>' +
      escapeHtml(o.id) +
      "</code></div>" +
      '<div class="mb-2"><strong>تاریخ:</strong> ' +
      escapeHtml(date) +
      "</div>" +
      '<div class="mb-2"><strong>وضعیت فعلی:</strong> ' +
      escapeHtml(STATUS_LABELS[o.status] || o.status) +
      " · <strong>پرداخت:</strong> " +
      (o.paymentStatus === "paid" ? "شده" : "نشده") +
      "</div>" +
      '<div class="mb-2"><strong>مبلغ کل:</strong> ' +
      money(o.total) +
      (o.shipping ? " (ارسال: " + money(o.shipping) + ")" : "") +
      "</div>" +
      '<div class="mb-2"><strong>مشتری:</strong> ' +
      escapeHtml(c.name || "—") +
      " / " +
      escapeHtml(c.phone || "—") +
      "<br/><span class=\"text-muted\">" +
      escapeHtml(c.address || "") +
      "</span></div>" +
      (o.baleChatId
        ? '<div class="mb-2"><strong>چت بله:</strong> ' +
          escapeHtml(String(o.baleChatId)) +
          "</div>"
        : "") +
      (o.note
        ? '<div class="mb-2"><strong>توضیح:</strong> ' +
          escapeHtml(o.note) +
          "</div>"
        : "") +
      '<div class="mb-2"><strong>اقلام:</strong><ul class="mb-0">' +
      (items || "<li>—</li>") +
      "</ul></div>" +
      '<hr/><div class="form-hint mb-2">تغییر وضعیت و پرداخت از طریق API ذخیره می‌شود. اگر فیلترشکن قطع باشد، خطا می‌گیرید.</div>';

    const statuses = [
      "pending",
      "confirmed",
      "packing",
      "shipped",
      "delivered",
      "cancelled",
      "returned"
    ];
    document.getElementById("orderStatusBtns").innerHTML =
      statuses
        .map(function (s) {
          var active = o.status === s ? " btn-adm" : " btn-outline-secondary";
          return (
            '<button type="button" class="btn btn-sm' +
            active +
            '" data-st="' +
            s +
            '">' +
            (STATUS_LABELS[s] || s) +
            "</button>"
          );
        })
        .join("") +
      (o.paymentStatus !== "paid"
        ? '<button type="button" class="btn btn-sm btn-success" id="btnMarkPaid">علامت پرداخت‌شده</button>'
        : '<span class="badge-soft badge-paid align-self-center">پرداخت ثبت شده</span>') +
      '<button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">بستن</button>';

    document.querySelectorAll("#orderStatusBtns [data-st]").forEach(function (btn) {
      btn.onclick = async function () {
        btn.disabled = true;
        try {
          await api("orders.status.update", {
            id: o.id,
            status: btn.dataset.st
          });
          toast(
            "وضعیت به «" +
              (STATUS_LABELS[btn.dataset.st] || btn.dataset.st) +
              "» تغییر کرد",
            "ok"
          );
          await loadAll();
          try {
            await loadLocalFallback();
          } catch (e) {}
          orderModal.hide();
          renderOrders();
          renderDashboard();
        } catch (e) {
          toast(e.message, "err");
          btn.disabled = false;
        }
      };
    });

    var payBtn = document.getElementById("btnMarkPaid");
    if (payBtn) {
      payBtn.onclick = async function () {
        payBtn.disabled = true;
        try {
          await api("orders.payment.mark", { id: o.id });
          toast("پرداخت ثبت شد", "ok");
          await loadAll();
          try {
            await loadLocalFallback();
          } catch (e) {}
          orderModal.hide();
          renderOrders();
          renderDashboard();
        } catch (e) {
          toast(e.message, "err");
          payBtn.disabled = false;
        }
      };
    }

    orderModal.show();
  }

  // expose for global use
  window.renderOrders = renderOrders;
  window.openOrder = openOrder;

  var _go = typeof goSection === "function" ? goSection : null;
  if (_go) {
    goSection = function (id) {
      if (id === "orders") {
        var p = Promise.resolve();
        if (typeof loadAll === "function")
          p = p.then(function () {
            return loadAll();
          }).catch(function () {});
        if (typeof loadLocalFallback === "function")
          p = p.then(function () {
            return loadLocalFallback();
          }).catch(function () {});
        p.then(function () {
          _go(id);
          renderOrders();
        });
        return;
      }
      return _go(id);
    };
  }
})();
