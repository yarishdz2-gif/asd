const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const PANEL_PASSWORD = process.env.PANEL_PASSWORD || "luau2026";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.PANEL_PASSWORD || "luau2026";

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL || "").replace(/\/$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const REDIS_KEY = process.env.REDIS_KEY || "luauvanguard:scripts";

const LOCAL_FILE = path.join(__dirname, "data", "scripts.json");
const TMP_FILE = path.join("/tmp", "luau-scripts.json");

app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

function hasUpstash() {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

async function redisCmd(parts) {
  const url = `${UPSTASH_URL}/${parts.map(encodeURIComponent).join("/")}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Upstash " + res.status + ": " + t.slice(0, 200));
  }
  return res.json();
}

async function redisGetDB() {
  const data = await redisCmd(["GET", REDIS_KEY]);
  if (!data || data.result == null || data.result === "") return null;
  try {
    return typeof data.result === "string" ? JSON.parse(data.result) : data.result;
  } catch {
    return null;
  }
}

async function redisSetDB(db) {
  const payload = JSON.stringify(db);
  // Always use POST body — reliable for large scripts (path method hits URL length limits)
  const res = await fetch(`${UPSTASH_URL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["SET", REDIS_KEY, payload]),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("Upstash SET fail: " + t.slice(0, 300));
  }
  return true;
}

function tryRead(file) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8") || "{}");
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

async function readDB() {
  if (hasUpstash()) {
    try {
      let db = await redisGetDB();
      if (!db || typeof db !== "object" || !Object.keys(db).length) {
        // First time or empty: seed from local file or default, then persist to Redis
        db = tryRead(LOCAL_FILE) || tryRead(TMP_FILE) || seed();
        await redisSetDB(db);
      }
      globalThis.__LUAU_DB = db;
      return db;
    } catch (e) {
      console.error("redis read fail", e.message);
      // Fall through to memory/file so the API still works while Redis is down
    }
  }
  if (globalThis.__LUAU_DB) return globalThis.__LUAU_DB;
  let db = tryRead(TMP_FILE) || tryRead(LOCAL_FILE) || seed();
  globalThis.__LUAU_DB = db;
  return db;
}

async function writeDB(db) {
  globalThis.__LUAU_DB = db;
  let backend = "memory";
  let redisError = null;

  if (hasUpstash()) {
    try {
      await redisSetDB(db);
      backend = "upstash";
    } catch (e) {
      redisError = e;
      console.error("redis write fail", e.message);
    }
  }

  // Always try local/tmp as backup (works on local; on Vercel /tmp is ephemeral)
  if (tryWrite(TMP_FILE, db) && backend === "memory") backend = "tmp";
  if (tryWrite(LOCAL_FILE, db)) {
    backend = backend === "upstash" ? "upstash+file" : "file";
  }

  // If Redis is configured but failed, surface the error so scripts are not silently lost
  if (hasUpstash() && redisError && backend !== "upstash" && !backend.includes("upstash")) {
    throw new Error(
      "No se pudo guardar en Redis (persistente). " +
        (redisError.message || String(redisError)) +
        " — revisa UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN"
    );
  }

  return backend;
}

function newId() {
  return String(Date.now()) + String(Math.floor(Math.random() * 900 + 100));
}

function auth(req, res, next) {
  const token =
    req.headers["x-admin-token"] ||
    (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "") ||
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

function isBrowser(req) {
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  const accept = String(req.headers["accept"] || "").toLowerCase();
  const secFetch = String(req.headers["sec-fetch-dest"] || "").toLowerCase();
  if (req.query.key === "raw" || req.query.force === "1") return false;
  if (secFetch === "document" || secFetch === "iframe") return true;
  if (accept.includes("text/html")) return true;
  if (
    ua.includes("mozilla") ||
    ua.includes("chrome") ||
    ua.includes("safari") ||
    ua.includes("firefox") ||
    ua.includes("edg/")
  ) {
    return true;
  }
  return false;
}

function blockedPage(id, name) {
  const title = name ? String(name).replace(/[<>&"]/g, "") : "Script";
  const sid = String(id || "").replace(/[<>&"]/g, "");
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>BLOQUEADO · Luauvanguard</title>
<style>
:root{--bg:#0e0a0e;--panel:#1a151a;--border:#2c2430;--text:#e9e5ea;--muted:#8a7e8c;--accent:#ebc7f6;--err:#ff5c7a}
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui,sans-serif;
background:radial-gradient(800px 400px at 50% -10%,#3a1a28 0%,transparent 55%),var(--bg);color:var(--text)}
.card{width:min(440px,100%);background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:28px 24px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.badge{display:inline-block;font-size:.72rem;font-weight:700;letter-spacing:.12em;color:var(--err);background:rgba(255,92,122,.12);border:1px solid rgba(255,92,122,.35);padding:6px 12px;border-radius:999px;margin-bottom:14px}
h1{font-size:1.6rem;margin-bottom:8px}p{color:var(--muted);font-size:.92rem;line-height:1.5;margin-bottom:10px}
.name{color:var(--accent);font-weight:600;margin:8px 0 14px;word-break:break-all}
.timer{font-size:2.4rem;font-weight:800;color:var(--accent);margin:12px 0;font-variant-numeric:tabular-nums}
.bar{height:6px;background:#241c26;border-radius:99px;overflow:hidden;margin:12px 0 18px}
.bar>i{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--err),var(--accent));transform-origin:left;animation:shrink 10s linear forwards}
@keyframes shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}
.steps{text-align:left;background:#141014;border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:14px 0;font-size:.82rem;color:var(--muted)}
.steps li{margin:6px 0 6px 16px}
.btns{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
a.btn{border-radius:10px;padding:11px 16px;font-weight:600;font-size:.88rem;text-decoration:none;display:inline-block}
.ghost{background:#2a222c;color:var(--text);border:1px solid var(--border)}
.foot{margin-top:16px;font-size:.75rem;color:#6a5e6c}
code{background:#141014;padding:2px 6px;border-radius:6px;color:var(--accent);font-size:.78rem}
</style></head><body>
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
</ul>
<div class="btns">
<a class="btn ghost" id="home" href="/" style="pointer-events:none;opacity:.45">Ir al inicio (5s)</a>
<a class="btn ghost" href="https://discord.gg/pZeYJEJGMj" target="_blank" rel="noopener">Discord</a>
<a class="btn ghost" href="https://luaavnr.hopto.org/create" target="_blank" rel="noopener">Website</a>
</div>
<p class="foot">Luauvanguard · raw shield</p>
</div>
<script>
(function(){var left=10,unlock=5,el=document.getElementById("t"),home=document.getElementById("home");
var iv=setInterval(function(){left--;if(el)el.textContent=String(Math.max(left,0));
if(left<=unlock&&home){home.style.pointerEvents="auto";home.style.opacity="1";home.textContent="Ir al inicio";}
if(left<=0){clearInterval(iv);location.replace("/");}},1000);})();
</script></body></html>`;
}

app.post("/api/auth/login", (req, res) => {
  const { password } = req.body || {};
  if (password === PANEL_PASSWORD) return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: "bad password" });
});

app.get("/api", async (_req, res) => {
  res.json({
    ok: true,
    name: "Luauvanguard Scripts API",
    version: "v1",
    storage: hasUpstash() ? "upstash-redis (persistent)" : "memory/file (may reset on Vercel)",
    upstashConfigured: hasUpstash(),
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

app.get("/api/health", async (_req, res) => {
  let storage = "memory";
  if (hasUpstash()) {
    try {
      await redisGetDB();
      storage = "upstash";
    } catch (e) {
      storage = "upstash-error: " + e.message;
    }
  }
  res.json({ ok: true, storage, time: new Date().toISOString() });
});

app.get("/api/v1", async (_req, res) => {
  try {
    const db = await readDB();
    const list = Object.values(db).map((s) => publicScript(s, false));
    res.json({
      ok: true,
      count: list.length,
      scripts: list,
      storage: hasUpstash() ? "upstash" : "memory/file",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/api/v1/scripts", async (_req, res) => {
  const db = await readDB();
  res.json({ ok: true, count: Object.keys(db).length, scripts: Object.values(db).map((s) => publicScript(s, false)) });
});

app.get("/api/v1/:id", async (req, res) => {
  const db = await readDB();
  const s = db[req.params.id];
  if (!s) return res.status(404).json({ ok: false, error: "not found" });
  res.json({ ok: true, script: publicScript(s, true) });
});

app.get("/api/v1/:id/raw", async (req, res) => {
  const db = await readDB();
  const script = db[req.params.id];
  if (!script) {
    if (isBrowser(req)) return res.status(404).type("html").send(blockedPage(req.params.id, "No encontrado"));
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

app.get("/api/v1/:id/load", async (req, res) => {
  const db = await readDB();
  const script = db[req.params.id];
  if (!script) {
    if (isBrowser(req)) return res.status(404).type("html").send(blockedPage(req.params.id, "No encontrado"));
    return res.status(404).type("text/plain").send('error("script not found")');
  }
  if (isBrowser(req)) {
    return res.status(403).type("html").send(blockedPage(script.id, script.name));
  }
  res.type("text/plain").send(script.code || "");
});

app.post("/api/v1", auth, async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.name || body.code === undefined || body.code === null || String(body.code) === "") {
      return res.status(400).json({ ok: false, error: "name and code required" });
    }
    const db = await readDB();
    const sid = body.id ? String(body.id) : newId();
    if (db[sid]) {
      return res.status(409).json({ ok: false, error: "id already exists — usa Actualizar o otro ID" });
    }
    const now = new Date().toISOString();
    db[sid] = {
      id: sid,
      name: String(body.name),
      game: String(body.game || "Universal"),
      description: String(body.description || ""),
      author: String(body.author || "Luauvanguard"),
      code: String(body.code),
      createdAt: now,
      updatedAt: now,
    };
    const backend = await writeDB(db);
    res.status(201).json({
      ok: true,
      storage: backend,
      script: publicScript(db[sid], false),
      note:
        backend.includes("upstash")
          ? "guardado permanente en Redis"
          : "sin Upstash: puede reiniciarse en Vercel. Configura UPSTASH_REDIS_REST_URL y UPSTASH_REDIS_REST_TOKEN",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.put("/api/v1/:id", auth, async (req, res) => {
  try {
    const db = await readDB();
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
    const backend = await writeDB(db);
    res.json({ ok: true, storage: backend, script: publicScript(s, false) });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.delete("/api/v1/:id", auth, async (req, res) => {
  try {
    const db = await readDB();
    if (!db[req.params.id]) return res.status(404).json({ ok: false, error: "not found" });
    delete db[req.params.id];
    await writeDB(db);
    res.json({ ok: true, deleted: req.params.id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`API http://localhost:${PORT}`);
    console.log(`Storage: ${hasUpstash() ? "Upstash Redis (persistent)" : "file/memory"}`);
    console.log(`Password: ${ADMIN_TOKEN}`);
  });
}
