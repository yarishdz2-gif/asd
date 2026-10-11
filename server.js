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

function isBrowser(req) {
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  const accept = String(req.headers["accept"] || "").toLowerCase();
  const secFetch = String(req.headers["sec-fetch-dest"] || "").toLowerCase();
  // Roblox HttpGet / executors: no mozilla, often empty accept or */*
  if (req.query.key === "raw" || req.query.force === "1") return false;
  if (secFetch === "document" || secFetch === "iframe") return true;
  if (accept.includes("text/html")) return true;
  if (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari") || ua.includes("firefox") || ua.includes("edg/")) {
    return true;
  }
  return false;
}

function blockedPage(id, name) {
  const title = name ? String(name).replace(/[<>&"]/g, "") : "Script";
  const sid = String(id || "").replace(/[<>&"]/g, "");
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>BLOQUEADO · Luauvanguard</title>
<style>
  :root{--bg:#0e0a0e;--panel:#1a151a;--border:#2c2430;--text:#e9e5ea;--muted:#8a7e8c;--accent:#ebc7f6;--err:#ff5c7a;--ok:#78f0a0}
  *{box-sizing:border-box;margin:0;padding:0}
  body{min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
    background:radial-gradient(800px 400px at 50% -10%,#3a1a28 0%,transparent 55%),var(--bg);color:var(--text)}
  .card{width:min(440px,100%);background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:28px 24px;
    box-shadow:0 30px 80px rgba(0,0,0,.45);text-align:center}
  .badge{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.12em;color:var(--err);
    background:rgba(255,92,122,.12);border:1px solid rgba(255,92,122,.35);padding:6px 12px;border-radius:999px;margin-bottom:14px}
  h1{font-size:1.6rem;margin-bottom:8px}
  p{color:var(--muted);font-size:.92rem;line-height:1.5;margin-bottom:10px}
  .name{color:var(--accent);font-weight:600;font-size:.95rem;margin:8px 0 14px;word-break:break-all}
  .timer{font-size:2.4rem;font-weight:800;color:var(--accent);margin:12px 0 6px;font-variant-numeric:tabular-nums}
  .bar{height:6px;background:#241c26;border-radius:99px;overflow:hidden;margin:12px 0 18px}
  .bar>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--err),var(--accent));transform-origin:left;animation:shrink 10s linear forwards}
  @keyframes shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
  .steps{text-align:left;background:#141014;border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:14px 0;font-size:.82rem;color:var(--muted)}
  .steps li{margin:6px 0 6px 16px}
  .btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:8px}
  a.btn,button.btn{cursor:pointer;border:none;border-radius:10px;padding:11px 16px;font-weight:600;font-size:.88rem;text-decoration:none;display:inline-block}
  .primary{background:var(--accent);color:#18121a}
  .ghost{background:#2a222c;color:var(--text);border:1px solid var(--border)}
  .foot{margin-top:16px;font-size:.75rem;color:#6a5e6c}
  code{background:#141014;padding:2px 6px;border-radius:6px;color:var(--accent);font-size:.78rem}
</style>
</head>
<body>
  <div class="card">
    <div class="badge">ACCESO BLOQUEADO</div>
    <h1>BLOQUEADO</h1>
    <p>Este enlace <code>/raw</code> no se puede ver en el navegador.</p>
    <div class="name">${title}<br/><code>${sid}</code></div>
    <p>Redirección automática a la página principal</p>
    <div class="timer" id="t">10</div>
    <div class="bar"><i></i></div>
    <ul class="steps">
      <li>Protección anti-leak: el código solo sale por HttpGet del executor</li>
      <li>Espera <b>5s</b> para desbloquear el botón de inicio</li>
      <li>En <b>10s</b> te mandamos al panel principal</li>
      <li>Si eres dev: usa el loader, no abras /raw en Chrome</li>
    </ul>
    <div class="btns">
      <a class="btn ghost" id="home" href="/" style="pointer-events:none;opacity:.45">Ir al inicio (5s)</a>
      <a class="btn ghost" href="https://discord.gg/pZeYJEJGMj" target="_blank" rel="noopener">Discord</a>
      <a class="btn ghost" href="https://luaavnr.hopto.org/create" target="_blank" rel="noopener">Website</a>
    </div>
    <p class="foot">Luauvanguard · raw shield · no copies scripts desde el navegador</p>
  </div>
<script>
(function(){
  var left=10, unlock=5;
  var el=document.getElementById("t");
  var home=document.getElementById("home");
  var iv=setInterval(function(){
    left--;
    if(el) el.textContent=String(Math.max(left,0));
    if(left<=unlock && home){
      home.style.pointerEvents="auto";
      home.style.opacity="1";
      home.textContent="Ir al inicio";
    }
    if(left<=0){
      clearInterval(iv);
      location.replace("/");
    }
  },1000);
})();
</script>
</body>
</html>`;
}

app.get("/api/v1/:id/raw", (req, res) => {
  const db = readDB();
  const script = db[req.params.id];
  if (!script) {
    if (isBrowser(req)) {
      res.status(404).type("html").send(blockedPage(req.params.id, "No encontrado"));
      return;
    }
    return res.status(404).type("text/plain").send("-- not found");
  }
  if (isBrowser(req)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
    return res.status(403).type("html").send(blockedPage(script.id, script.name));
  }
  res.setHeader("Cache-Control", "no-store");
  res.type("text/plain").send(script.code || "");
});

app.get("/api/v1/:id/load", (req, res) => {
  const db = readDB();
  const script = db[req.params.id];
  if (!script) {
    if (isBrowser(req)) {
      return res.status(404).type("html").send(blockedPage(req.params.id, "No encontrado"));
    }
    return res.status(404).type("text/plain").send('error("script not found")');
  }
  if (isBrowser(req)) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.status(403).type("html").send(blockedPage(script.id, script.name));
  }
  res.type("text/plain").send(script.code || "");
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
