const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "changeme-luau-token";
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "luau2026";

const DATA_FILE = path.join(__dirname, "data", "scripts.json");

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function readDB() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, "{}");
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeDB(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function newId() {
  return String(Date.now()) + String(Math.floor(Math.random() * 900 + 100));
}

function auth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

function publicScript(s, full) {
  if (!s) return null;
  const out = {
    id: s.id,
    name: s.name,
    game: s.game,
    description: s.description || "",
    author: s.author || "",
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
  if (full) out.code = s.code;
  return out;
}


app.post("/api/auth/login", (req, res) => {
  const { password } = req.body || {};
  if (password === PANEL_PASSWORD) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: "bad password" });
});

// ---------- API v1 ----------
app.get("/api", (_req, res) => {
  res.json({
    ok: true,
    name: "Luauvanguard Scripts API",
    version: "v1",
    endpoints: {
      list: "GET /api/v1",
      listAlt: "GET /api/v1/scripts",
      get: "GET /api/v1/:id",
      raw: "GET /api/v1/:id/raw",
      create: "POST /api/v1  (header x-admin-token)",
      update: "PUT /api/v1/:id  (header x-admin-token)",
      delete: "DELETE /api/v1/:id  (header x-admin-token)",
    },
  });
});

app.get("/api/v1", (_req, res) => {
  const db = readDB();
  const list = Object.values(db).map((s) => publicScript(s, false));
  res.json({ ok: true, count: list.length, scripts: list });
});

app.get("/api/v1/scripts", (_req, res) => {
  const db = readDB();
  const list = Object.values(db).map((s) => publicScript(s, false));
  res.json({ ok: true, count: list.length, scripts: list });
});

app.get("/api/v1/:id", (req, res) => {
  const db = readDB();
  const s = db[req.params.id];
  if (!s) return res.status(404).json({ ok: false, error: "not found" });
  res.json({ ok: true, script: publicScript(s, true) });
});

app.get("/api/v1/:id/raw", (req, res) => {
  const db = readDB();
  const s = db[req.params.id];
  if (!s) return res.status(404).type("text/plain").send("-- not found");
  res.type("text/plain").send(s.code || "");
});

app.post("/api/v1", auth, (req, res) => {
  const { name, game, description, author, code, id } = req.body || {};
  if (!name || !code) {
    return res.status(400).json({ ok: false, error: "name and code required" });
  }
  const db = readDB();
  const sid = id ? String(id) : newId();
  if (db[sid]) {
    return res.status(409).json({ ok: false, error: "id already exists" });
  }
  const now = new Date().toISOString();
  db[sid] = {
    id: sid,
    name: String(name),
    game: String(game || "Universal"),
    description: String(description || ""),
    author: String(author || "Luauvanguard"),
    code: String(code),
    createdAt: now,
    updatedAt: now,
  };
  writeDB(db);
  res.status(201).json({ ok: true, script: publicScript(db[sid], false) });
});

app.post("/api/v1/scripts", auth, (req, res) => {
  req.url = "/api/v1";
  app._router.handle(req, res, () => {});
});

app.put("/api/v1/:id", auth, (req, res) => {
  const db = readDB();
  const s = db[req.params.id];
  if (!s) return res.status(404).json({ ok: false, error: "not found" });
  const { name, game, description, author, code } = req.body || {};
  if (name !== undefined) s.name = String(name);
  if (game !== undefined) s.game = String(game);
  if (description !== undefined) s.description = String(description);
  if (author !== undefined) s.author = String(author);
  if (code !== undefined) s.code = String(code);
  s.updatedAt = new Date().toISOString();
  db[s.id] = s;
  writeDB(db);
  res.json({ ok: true, script: publicScript(s, false) });
});

app.delete("/api/v1/:id", auth, (req, res) => {
  const db = readDB();
  if (!db[req.params.id]) {
    return res.status(404).json({ ok: false, error: "not found" });
  }
  delete db[req.params.id];
  writeDB(db);
  res.json({ ok: true, deleted: req.params.id });
});

// Roblox-friendly loader endpoint
app.get("/api/v1/:id/load", (req, res) => {
  const db = readDB();
  const s = db[req.params.id];
  if (!s) return res.status(404).type("text/plain").send('error("script not found")');
  res.type("text/plain").send(s.code || "");
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Vercel serverless export
module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Luauvanguard API on http://localhost:${PORT}`);
    console.log(`Admin token: ${ADMIN_TOKEN}`);
  });
}
