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
    if (!res.ok) throw new Error("تعذر تحميل المكتبة");
    const items = await res.json();
    if (!items.length) { itemsBox.innerHTML = '<div class="empty">لا توجد ترجمات بعد. ارفع أول ملف SUP.</div>'; return; }
    itemsBox.innerHTML = "";
    for (const item of items) {
      const row = document.createElement("div"); row.className = "item";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.originalName;
      const meta = document.createElement("small");
      meta.textContent = `${item.type === "movie" ? "فيلم" : `مسلسل · S${item.season}E${item.episode}`} · ${item.imdbId} · ${item.lang} · ${(item.size/1048576).toFixed(1)} MB`;
      info.append(title, meta);
      const del = document.createElement("button"); del.className = "delete"; del.textContent = "حذف";
      del.addEventListener("click", async () => {
        if (!confirm("حذف ملف الترجمة؟")) return;
        const response = await fetch(`/api/subtitles/${encodeURIComponent(item.id)}`, { method: "DELETE" });
        if (response.ok) loadItems();
      });
      row.append(info, del); itemsBox.append(row);
    }
  } catch (e) { itemsBox.textContent = e.message; }
}
form.addEventListener("submit", async e => {
  e.preventDefault(); message.textContent = "";
  const button = document.querySelector("#submit"); button.disabled = true; button.textContent = "جارٍ الرفع...";
  try {
    const res = await fetch("/api/subtitles", { method: "POST", body: new FormData(form) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل الرفع");
    message.textContent = "تم رفع الملف وحفظه.";
    form.reset(); fileName.textContent = "اختر ملف الترجمة أو اسحبه هنا"; toggleEpisode(); loadItems();
  } catch (err) { message.textContent = err.message; message.style.color = "#ff9999"; }
  finally { button.disabled = false; button.textContent = "رفع الترجمة"; }
});
document.querySelector("#refresh").addEventListener("click", loadItems);
loadItems();