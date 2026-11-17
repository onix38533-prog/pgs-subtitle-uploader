import { upload } from "https://esm.sh/@vercel/blob@2.0.0/client";

const form = document.querySelector("#uploadForm");
const fileInput = document.querySelector("#file");
const fileName = document.querySelector("#fileName");
const message = document.querySelector("#message");
const itemsBox = document.querySelector("#items");
const typeSelect = document.querySelector("#type");

fileInput.addEventListener("change", () => {
  fileName.textContent = fileInput.files[0]?.name || "اختر ملف الترجمة أو اسحبه هنا";
});
function toggleEpisode() {
  document.querySelectorAll(".episode").forEach(el => el.style.display = typeSelect.value === "series" ? "flex" : "none");
}
typeSelect.addEventListener("change", toggleEpisode); toggleEpisode();

async function loadItems() {
  itemsBox.innerHTML = '<p class="muted">جارٍ تحميل المكتبة...</p>';
  try {
    const res = await fetch("/api/subtitles");
    if (!res.ok) throw new Error(res.status === 401 ? "سجّل الدخول مجددًا." : "تعذر تحميل المكتبة");
    const items = await res.json();
    if (!items.length) { itemsBox.innerHTML = '<div class="empty">لا توجد ترجمات بعد. ارفع أول ملف SUP.</div>'; return; }
    itemsBox.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div"); row.className = "item";
      const info = document.createElement("div");
      const title = document.createElement("strong"); title.textContent = item.originalName;
      const meta = document.createElement("small");
      meta.textContent = `${item.type === "movie" ? "فيلم" : `مسلسل · S${item.season}E${item.episode}`} · ${item.imdbId} · ${item.lang} · ${(item.size/1048576).toFixed(1)} MB`;
      info.append(title, meta);
      const del = document.createElement("button"); del.className = "delete"; del.textContent = "حذف";
      del.addEventListener("click", async () => {
        if (!confirm("حذف ملف الترجمة؟")) return;
        const response = await fetch(`/api/subtitles/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        if (response.ok) loadItems(); else alert("تعذر حذف الترجمة.");
      });
      row.append(info, del); itemsBox.append(row);
    }
  } catch (e) { itemsBox.textContent = e.message; }
}
form.addEventListener("submit", async e => {
  e.preventDefault(); message.textContent = ""; message.style.color = "";
  const file = fileInput.files[0];
  if (!file || !file.name.toLowerCase().endsWith(".sup")) { message.textContent = "اختر ملفًا بصيغة .sup"; return; }
  const button = document.querySelector("#submit"); button.disabled = true; button.textContent = "جارٍ رفع الملف مباشرة إلى التخزين...";
  try {
    // The file goes directly from the browser to Blob, bypassing Vercel Functions' 4.5 MB body limit.
    const uploaded = await upload(`uploads/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`, file, {
      access: "public",
      handleUploadUrl: "/api/upload-token",
      contentType: "application/octet-stream"
    });
    const data = Object.fromEntries(new FormData(form).entries());
    const save = await fetch("/api/subtitles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data, blobUrl: uploaded.url, blobPath: uploaded.pathname,
        originalName: file.name, size: file.size
      })
    });
    const saved = await save.json();
    if (!save.ok) throw new Error(saved.error || "تم رفع الملف لكن تعذر حفظ بياناته");
    message.textContent = "تم رفع الملف وحفظه في المكتبة.";
    form.reset(); fileName.textContent = "اختر ملف الترجمة أو اسحبه هنا"; toggleEpisode(); loadItems();
  } catch (err) {
    message.textContent = err.message || "فشل الرفع"; message.style.color = "#ff9999";
  } finally {
    button.disabled = false; button.textContent = "رفع الترجمة";
  }
});
document.querySelector("#refresh").addEventListener("click", loadItems);
loadItems();
