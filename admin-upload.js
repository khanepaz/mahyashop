/* Image upload helpers for admin panel — loads after admin.js */
(function () {
  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve(r.result);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1280;
    quality = quality || 0.82;
    return readFileAsDataURL(file).then(function (dataUrl) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var w = img.width,
            h = img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.round(w * scale),
            ch = Math.round(h * scale);
          var canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
          var outType = file.type === "image/png" ? "image/png" : "image/jpeg";
          resolve({
            dataUrl: canvas.toDataURL(outType, quality),
            mime: outType,
            name:
              file.name ||
              "upload." + (outType === "image/png" ? "png" : "jpg")
          });
        };
        img.onerror = function () {
          reject(new Error("خواندن تصویر ناموفق"));
        };
        img.src = dataUrl;
      });
    });
  }

  async function uploadImageFile(file, statusEl) {
    if (!file) throw new Error("فایلی انتخاب نشده");
    if (typeof api !== "function") throw new Error("API آماده نیست");
    if (statusEl) statusEl.textContent = "در حال فشرده‌سازی...";
    var compressed = await compressImage(file);
    if (statusEl) statusEl.textContent = "در حال آپلود...";
    var result = await api("media.upload", {
      base64: compressed.dataUrl,
      filename: compressed.name,
      mime: compressed.mime
    });
    if (statusEl) statusEl.textContent = "آپلود شد ✓";
    return result.path || result.url;
  }

  function bindOne(fileId, pathId, statusId, previewId) {
    var fileInput = document.getElementById(fileId);
    if (!fileInput) return;
    fileInput.addEventListener("change", async function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var statusEl = statusId ? document.getElementById(statusId) : null;
      var preview = previewId ? document.getElementById(previewId) : null;
      try {
        var path = await uploadImageFile(file, statusEl);
        var pathInput = document.getElementById(pathId);
        if (pathInput) pathInput.value = path;
        if (preview) {
          preview.src = path;
          preview.classList.remove("d-none");
        }
        if (typeof toast === "function") toast("تصویر آپلود شد", "ok");
      } catch (e) {
        if (statusEl) statusEl.textContent = "";
        if (typeof toast === "function")
          toast(e.message || "خطا در آپلود", "err");
        else alert(e.message || "خطا در آپلود");
      }
      fileInput.value = "";
    });
  }

  function wirePreviews() {
    ["pImage", "bImage"].forEach(function (id) {
      var input = document.getElementById(id);
      var preview = document.getElementById(
        id === "pImage" ? "pImagePreview" : "bImagePreview"
      );
      if (!input || !preview) return;
      input.addEventListener("change", function () {
        var v = input.value.trim();
        if (v) {
          preview.src = v;
          preview.classList.remove("d-none");
        } else {
          preview.classList.add("d-none");
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    bindOne("pImageFile", "pImage", "pImageStatus", "pImagePreview");
    bindOne("bImageFile", "bImage", "bImageStatus", "bImagePreview");
    wirePreviews();
  });
})();
