const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "luau2026";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.PANEL_PASSWORD || "luau2026";

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- STORAGE (file + memory, Vercel-safe) ----------
const LOCAL_FILE = path.join(__dirname, "data", "scripts.json");
const TMP_FILE = path.join("/tmp", "luau-scripts.json");

function seed() {
  return {
    "203028932093": {
      id: "203028932093",
      name: "Luauvanguard Universal Loader",
      game: "Universal",
      description: "Loader con UI propia · sin key",
      author: "Luauvanguard",
      createdAt: "2026-10-11T00:00:00.000Z",
      updatedAt: "2026-10-11T00:00:00.000Z",
      code: "-- paste your loader here",
    },
  };
}

if (!globalThis.__LUAU_DB) {
  globalThis.__LUAU_DB = null;
}

function tryRead(file) {
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const j = JSON.parse(raw || "{}");
      if (j && typeof j === "object") return j;
    }
  } catch (_) {}
  return null;
}

function tryWrite(file, db) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(db, null, 2));
    return true;
  } catch (_) {
    return false;
  }
}

function readDB() {
  if (globalThis.__LUAU_DB) return globalThis.__LUAU_DB;

  let db = tryRead(TMP_FILE) || tryRead(LOCAL_FILE);
  if (!db || !Object.keys(db).length) db = seed();

  globalThis.__LUAU_DB = db;
  return db;
}

function writeDB(db) {
  globalThis.__LUAU_DB = db;
  const okTmp = tryWrite(TMP_FILE, db);
  const okLocal = tryWrite(LOCAL_FILE, db);
  return okTmp || okLocal;
}

function newId() {
  return String(Date.now()) + String(Math.floor(Math.random() * 900 + 100));
}

function auth(req, res, next) {
  const token =
    req.headers["x-admin-token"] ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
    req.query.token ||
    "";
  const allowed = new Set([ADMIN_TOKEN, PANEL_PASSWORD].filter(Boolean));
  if (!allowed.has(String(token))) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      hint: "Admin token = contraseña del panel (default luau2026)",
    });
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
  if (password === PANEL_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: "bad password" });
});

app.get("/api", (_req, res) => {
  res.json({
    ok: true,
    name: "Luauvanguard Scripts API",
    version: "v1",
    endpoints: {
      list: "GET /api/v1",
      get: "GET /api/v1/:id",
      raw: "GET /api/v1/:id/raw",
      create: "POST /api/v1",
      update: "PUT /api/v1/:id",
      delete: "DELETE /api/v1/:id",
    },
  });
});

app.get("/api/v1", (_req, res) => {
  try {
    const db = readDB();
    const list = Object.values(db).map((s) => publicScript(s, false));
    res.json({ ok: true, count: list.length, scripts: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
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

app.get("/api/v1/:id/load", (req, res) => {
  const db = readDB();
  const s = db[req.params.id];
  if (!s) return res.status(404).type("text/plain").send('error("script not found")');
  res.type("text/plain").send(s.code || "");
});

app.post("/api/v1", auth, (req, res) => {
  try {
    const body = req.body || {};
    const name = body.name;
    const code = body.code;
    if (!name || code === undefined || code === null || String(code) === "") {
      return res.status(400).json({ ok: false, error: "name and code required" });
    }
    const db = readDB();
    const sid = body.id ? String(body.id) : newId();
    if (db[sid]) {
      return res.status(409).json({ ok: false, error: "id already exists — usa Actualizar o otro ID" });
    }
    const now = new Date().toISOString();
    db[sid] = {
      id: sid,
      name: String(name),
      game: String(body.game || "Universal"),
      description: String(body.description || ""),
      author: String(body.author || "Luauvanguard"),
      code: String(code),
      createdAt: now,
      updatedAt: now,
    };
    const persisted = writeDB(db);
    res.status(201).json({
      ok: true,
      persisted,
      script: publicScript(db[sid], false),
      note: persisted
        ? "guardado"
        : "guardado en memoria (Vercel); puede perderse al reiniciar — normal en plan free",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post("/api/v1/scripts", auth, (req, res) => {
  req.url = "/api/v1";
  req.method = "POST";
  app.handle(req, res);
});

app.put("/api/v1/:id", auth, (req, res) => {
  try {
    const db = readDB();
    const s = db[req.params.id];
    if (!s) return res.status(404).json({ ok: false, error: "not found" });
    const body = req.body || {};
    if (body.name !== undefined) s.name = String(body.name);
    if (body.game !== undefined) s.game = String(body.game);
    if (body.description !== undefined) s.description = String(body.description);
    if (body.author !== undefined) s.author = String(body.author);
    if (body.code !== undefined) s.code = String(body.code);
    s.updatedAt = new Date().toISOString();
    db[s.id] = s;
    const persisted = writeDB(db);
    res.json({ ok: true, persisted, script: publicScript(s, false) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.delete("/api/v1/:id", auth, (req, res) => {
  try {
    const db = readDB();
    if (!db[req.params.id]) {
      return res.status(404).json({ ok: false, error: "not found" });
    }
    delete db[req.params.id];
    writeDB(db);
    res.json({ ok: true, deleted: req.params.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API http://localhost:${PORT}`);
    console.log(`Password/Token: ${ADMIN_TOKEN}`);
  });
}
