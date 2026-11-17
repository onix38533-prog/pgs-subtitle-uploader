import { handleUpload } from "@vercel/blob/client";
import { put, list, del } from "@vercel/blob";
import crypto from "node:crypto";

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADDON_KEY = process.env.ADDON_KEY || "";
const BASE_URL = (process.env.BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "")).replace(/\/$/, "");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 300);

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function isAdmin(req) {
  const h = req.headers.authorization || "";
  const m = /^Basic\s+(.+)$/i.exec(h);
  if (!m) return false;
  let decoded;
  try { decoded = Buffer.from(m[1], "base64").toString("utf8"); } catch { return false; }
  const i = decoded.indexOf(":");
  return i >= 0 && safeEqual(decoded.slice(0, i), ADMIN_USER) && safeEqual(decoded.slice(i + 1), ADMIN_PASSWORD);
}
function requireAdmin(req, res) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16 || !ADDON_KEY || ADDON_KEY.length < 24) {
    json(res, 500, { error: "Set ADMIN_PASSWORD (16+ chars) and ADDON_KEY (24+ chars) in Vercel Environment Variables." });
    return false;
  }
  if (!isAdmin(req)) {
    res.setHeader("WWW-Authenticate", 'Basic realm="PGS Subtitle Library", charset="UTF-8"');
    res.statusCode = 401; res.end("Authentication required"); return false;
  }
  return true;
}
function cleanText(v, max=160) { return String(v || "").trim().slice(0,max); }
function validImdb(v) { return /^tt\d{5,12}$/.test(String(v || "")); }
function getPath(req) {
  const u = new URL(req.url, `https://${req.headers.host || "localhost"}`);
  return { pathname: u.pathname, query: u.searchParams };
}
async function getItems() {
  const result = await list({ prefix: "metadata/" });
  const blobs = result.blobs || [];
  const items = await Promise.all(blobs.map(async b => {
    try { const r = await fetch(b.url, { cache: "no-store" }); if (!r.ok) return null; return await r.json(); }
    catch { return null; }
  }));
  return items.filter(Boolean);
}
async function findItem(id) {
  const result = await list({ prefix: `metadata/${id}.json` });
  const b = (result.blobs || []).find(x => x.pathname === `metadata/${id}.json`);
  if (!b) return null;
  const r = await fetch(b.url, { cache: "no-store" });
  return r.ok ? await r.json() : null;
}
function publicItem(x) {
  const { blobUrl, metadataPath, ...safe } = x;
  return safe;
}

export default async function handler(req, res) {
  const { pathname, query } = getPath(req);
  const publicPath = pathname.replace(/^\/api(?=\/(?:addon|files)\/)/, "");
  try {
    if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true });

    // Admin endpoints
    if (pathname === "/api/subtitles" || pathname.startsWith("/api/subtitles/") || pathname === "/api/upload-token") {
      if (!requireAdmin(req, res)) return;
    }

    if (req.method === "GET" && pathname === "/api/subtitles") {
      const items = await getItems();
      return json(res, 200, items.map(publicItem));
    }

    if (req.method === "POST" && pathname === "/api/upload-token") {
      const result = await handleUpload({
        request: req,
        body: req.body,
        onBeforeGenerateToken: async (pathname) => {
          if (!String(pathname).toLowerCase().endsWith(".sup")) throw new Error("Only .sup files are accepted.");
          return {
            allowedContentTypes: ["application/octet-stream", "application/x-subrip", "application/octet-stream"],
            maximumSizeInBytes: MAX_UPLOAD_MB * 1024 * 1024,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify({ purpose: "pgs-subtitle-upload" })
          };
        }
      });
      return json(res, 200, result);
    }

    if (req.method === "POST" && pathname === "/api/subtitles") {
      const body = req.body || {};
      const type = cleanText(body.type, 12);
      const imdbId = cleanText(body.imdbId, 16);
      const lang = cleanText(body.lang || "ara", 8);
      const label = cleanText(body.label || "PGS Arabic", 80);
      const season = Number(body.season);
      const episode = Number(body.episode);
      const blobUrl = String(body.blobUrl || "");
      const blobPath = String(body.blobPath || "");
      const originalName = cleanText(body.originalName, 240);
      if (!["movie","series"].includes(type) || !validImdb(imdbId) || !blobUrl.startsWith("https://") || !blobPath.startsWith("uploads/") || !originalName.toLowerCase().endsWith(".sup")) {
        return json(res, 400, { error: "بيانات الترجمة غير صحيحة." });
      }
      if (type === "series" && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
        return json(res, 400, { error: "المسلسلات تحتاج رقم الموسم والحلقة." });
      }
      const id = crypto.randomUUID();
      const item = {
        id, type, imdbId, season: type === "series" ? season : null,
        episode: type === "series" ? episode : null, lang, label,
        originalName, size: Number(body.size || 0), uploadedAt: new Date().toISOString(),
        blobUrl, blobPath, metadataPath: `metadata/${id}.json`
      };
      await put(item.metadataPath, JSON.stringify(item), { access: "public", addRandomSuffix: false, contentType: "application/json; charset=utf-8", allowOverwrite: false });
      return json(res, 201, publicItem(item));
    }

    const delMatch = pathname.match(/^\/api\/subtitles\/([0-9a-f-]+)$/i);
    if (req.method === "DELETE" && delMatch) {
      const item = await findItem(delMatch[1]);
      if (!item) return json(res, 404, { error: "Not found" });
      await del(item.blobUrl);
      const meta = await list({ prefix: item.metadataPath });
      const metaBlob = (meta.blobs || []).find(x => x.pathname === item.metadataPath);
      if (metaBlob) await del(metaBlob.url);
      return json(res, 200, { ok: true });
    }

    const manifestMatch = publicPath.match(/^\/addon\/([^/]+)\/manifest\.json$/);
    if (req.method === "GET" && manifestMatch) {
      if (!safeEqual(manifestMatch[1], ADDON_KEY)) return json(res, 404, { error: "Not found" });
      return json(res, 200, {
        id: "private.pgs.subtitle.uploader", version: "0.2.0",
        name: "My PGS Subtitles", description: "Private library of personally uploaded PGS/SUP subtitles.",
        resources: [{ name: "subtitles", types: ["movie","series"], idPrefixes: ["tt"] }],
        types: ["movie","series"], idPrefixes: ["tt"], catalogs: [],
        behaviorHints: { configurable: false, configurationRequired: false }
      });
    }

    const subsMatch = publicPath.match(/^\/addon\/([^/]+)\/subtitles\/(movie|series)\/([^/]+)\.json$/);
    if (req.method === "GET" && subsMatch) {
      if (!safeEqual(subsMatch[1], ADDON_KEY)) return json(res, 404, { error: "Not found" });
      const type = subsMatch[2]; const imdbId = subsMatch[3].split(":")[0];
      const season = Number(query.get("season") ?? query.get("videoSeason"));
      const episode = Number(query.get("episode") ?? query.get("videoEpisode"));
      let matches = (await getItems()).filter(x => x.type === type && x.imdbId === imdbId);
      if (type === "series") matches = matches.filter(x => x.season === season && x.episode === episode && season > 0 && episode > 0);
      res.setHeader("Cache-Control", "no-store");
      return json(res, 200, { subtitles: matches.map(x => ({
        id: x.id, url: `${BASE_URL}/files/${ADDON_KEY}/${x.id}`, lang: x.lang, label: x.label
      })) });
    }

    const fileMatch = publicPath.match(/^\/files\/([^/]+)\/([0-9a-f-]+)$/i);
    if (req.method === "GET" && fileMatch) {
      if (!safeEqual(fileMatch[1], ADDON_KEY)) return json(res, 404, { error: "Not found" });
      const item = await findItem(fileMatch[2]);
      if (!item || !item.blobUrl) return json(res, 404, { error: "Not found" });
      res.statusCode = 302; res.setHeader("Location", item.blobUrl); res.end(); return;
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: err?.message || "Server error" });
  }
}
