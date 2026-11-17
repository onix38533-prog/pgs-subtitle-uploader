import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT || 3000);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADDON_KEY = process.env.ADDON_KEY;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const FILE_DIR = path.join(DATA_DIR, "uploads");
const DB_FILE = path.join(DATA_DIR, "subtitles.json");
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 300);

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16 || !ADDON_KEY || ADDON_KEY.length < 24) {
  console.error("Set ADMIN_PASSWORD (16+ chars) and ADDON_KEY (24+ chars) before starting.");
  process.exit(1);
}

await fs.mkdir(FILE_DIR, { recursive: true });
async function readDb() {
  try { return JSON.parse(await fs.readFile(DB_FILE, "utf8")); }
  catch (e) { if (e.code === "ENOENT") return []; throw e; }
}
async function writeDb(items) {
  const temp = `${DB_FILE}.tmp`;
  await fs.writeFile(temp, JSON.stringify(items, null, 2));
  await fs.rename(temp, DB_FILE);
}
function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    let decoded = "";
    try { decoded = Buffer.from(encoded, "base64").toString("utf8"); } catch {}
    const split = decoded.indexOf(":");
    const user = split >= 0 ? decoded.slice(0, split) : "";
    const pass = split >= 0 ? decoded.slice(split + 1) : "";
    if (safeEqual(user, ADMIN_USER) && safeEqual(pass, ADMIN_PASSWORD)) return next();
  }
  res.set("WWW-Authenticate", 'Basic realm="PGS Subtitle Library", charset="UTF-8"');
  return res.status(401).send("Authentication required");
}
function addonAuth(req, res, next) {
  if (safeEqual(req.params.key, ADDON_KEY)) return next();
  return res.status(404).json({ error: "Not found" });
}
function cleanText(value, max = 160) {
  return String(value || "").trim().slice(0, max);
}
function validImdb(value) { return /^tt\d{5,12}$/.test(String(value || "")); }
function mediaKey(item) {
  if (item.type === "movie") return `movie:${item.imdbId}`;
  return `series:${item.imdbId}:${item.season}:${item.episode}`;
}
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, FILE_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".sup") return cb(new Error("Only .sup files are accepted."));
    cb(null, true);
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/", adminAuth, (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use("/assets", express.static(path.join(__dirname, "public"), { index: false }));

app.get("/api/subtitles", adminAuth, async (_req, res) => {
  const items = await readDb();
  res.json(items.map(({ storedName, ...safe }) => safe));
});

app.post("/api/subtitles", adminAuth, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a .sup file." });
  const type = cleanText(req.body.type, 12);
  const imdbId = cleanText(req.body.imdbId, 16);
  const lang = cleanText(req.body.lang || "ara", 8);
  const label = cleanText(req.body.label || "PGS Arabic", 80);
  const season = Number(req.body.season);
  const episode = Number(req.body.episode);

  if (!["movie", "series"].includes(type) || !validImdb(imdbId)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: "Use movie/series and a valid IMDb ID (tt1234567)." });
  }
  if (type === "series" && (!Number.isInteger(season) || season < 1 || !Number.isInteger(episode) || episode < 1)) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: "Series uploads require season and episode numbers." });
  }

  const item = {
    id: crypto.randomUUID(),
    type, imdbId, season: type === "series" ? season : null,
    episode: type === "series" ? episode : null,
    lang, label, originalName: cleanText(req.file.originalname, 240),
    storedName: req.file.filename, size: req.file.size,
    uploadedAt: new Date().toISOString()
  };
  const items = await readDb();
  items.push(item);
  await writeDb(items);
  const { storedName, ...safe } = item;
  res.status(201).json(safe);
});

app.delete("/api/subtitles/:id", adminAuth, async (req, res) => {
  const items = await readDb();
  const item = items.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  await fs.unlink(path.join(FILE_DIR, item.storedName)).catch(() => {});
  await writeDb(items.filter(x => x.id !== item.id));
  res.json({ ok: true });
});

app.get("/files/:key/:id", addonAuth, async (req, res) => {
  const items = await readDb();
  const item = items.find(x => x.id === req.params.id);
  if (!item) return res.status(404).end();
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${item.originalName.replace(/["\\]/g, "_")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(FILE_DIR, item.storedName));
});

app.get("/addon/:key/manifest.json", addonAuth, (req, res) => {
  res.json({
    id: "private.pgs.subtitle.uploader",
    version: "0.1.0",
    name: "My PGS Subtitles",
    description: "Private library of personally uploaded PGS/SUP subtitles.",
    resources: [{ name: "subtitles", types: ["movie", "series"], idPrefixes: ["tt"] }],
    types: ["movie", "series"],
    idPrefixes: ["tt"],
    catalogs: [],
    behaviorHints: { configurable: false, configurationRequired: false }
  });
});

// Stremio's subtitle protocol uses the item ID for the request. For series,
// videoID/season+episode may be supplied as extraArgs depending on client version.
// The admin UI also stores the episode mapping explicitly.
app.get("/addon/:key/subtitles/:type/:id.json", addonAuth, async (req, res) => {
  const { type } = req.params;
  const imdbId = req.params.id.split(":")[0];
  const extra = { ...req.query };
  const season = Number(extra.season ?? extra.videoSeason);
  const episode = Number(extra.episode ?? extra.videoEpisode);
  const items = await readDb();
  let matches = items.filter(x => x.type === type && x.imdbId === imdbId);

  if (type === "series") {
    if (Number.isInteger(season) && season > 0 && Number.isInteger(episode) && episode > 0) {
      matches = matches.filter(x => x.season === season && x.episode === episode);
    } else {
      matches = [];
    }
  }
  res.set("Cache-Control", "no-store");
  res.json({
    subtitles: matches.map(x => ({
      id: x.id,
      url: `${BASE_URL}/files/${ADDON_KEY}/${x.id}`,
      lang: x.lang,
      label: x.label
    }))
  });
});

app.use((err, _req, res, _next) => {
  console.error(err.message);
  const status = err instanceof multer.MulterError ? 400 : 400;
  res.status(status).json({ error: err.message || "Request failed" });
});

app.listen(PORT, () => console.log(`PGS Subtitle Uploader listening on ${PORT}`));
