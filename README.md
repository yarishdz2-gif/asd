# Luauvanguard Scripts API

## Que los scripts NUNCA se borren (Vercel)

Vercel es serverless: **no guarda archivos**.  
Para que los scripts sean **permanentes** hay que usar **Upstash Redis** (gratis).

### Pasos (una sola vez)

1. Entra a https://upstash.com → crea cuenta (gratis)
2. **Create Database** → Redis → elige región cercana (ej. us-east-1)
3. Copia:
   - **REST URL** (ejemplo: `https://xxxx.upstash.io`)
   - **REST TOKEN** (ejemplo: `AYxx...`)
4. En Vercel → tu proyecto → **Settings** → **Environment Variables** añade:

```
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AYxx...
PANEL_PASSWORD=luau2026
ADMIN_TOKEN=luau2026
```

5. **Redeploy** el proyecto (Deployments → ⋯ → Redeploy)

### Cómo saber si está bien

- Abre `https://TU_DOMINIO.vercel.app/api`
- Debe decir: `"storage": "upstash-redis (persistent)"`
- Si dice `memory/file` → faltan las variables o el redeploy

Sin Upstash, en cada cold start / redeploy los scripts se reinician al seed por defecto.

En local (`node server.js`) se guardan en `data/scripts.json` sin necesidad de Redis.

---

## Local

```bash
npm install
ADMIN_TOKEN=luau2026 node server.js
```

Abre http://localhost:3000

## Roblox (executor)

```lua
loadstring(game:HttpGet("https://TU_DOMINIO.vercel.app/api/v1/ID/raw"))()
```

Si abres `/raw` en el navegador verás **BLOQUEADO** (protección anti-leak). Solo el executor recibe el código.

---

## API rápida

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | `/api` | no | Estado + storage |
| GET | `/api/v1` | no | Lista scripts |
| GET | `/api/v1/:id` | no | Detalle (sin code) |
| GET | `/api/v1/:id/raw` | no | Código crudo (solo executor) |
| POST | `/api/v1` | sí | Crear script |
| PUT | `/api/v1/:id` | sí | Actualizar |
| DELETE | `/api/v1/:id` | sí | Borrar |

Auth: header `x-admin-token: luau2026` (o el valor de `ADMIN_TOKEN`).
