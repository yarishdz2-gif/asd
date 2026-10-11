# Luauvanguard Scripts API

## Local
```bash
cd luau-scripts-api
npm install
ADMIN_TOKEN=tu_token node server.js
```

## Vercel
1. Sube la carpeta a GitHub
2. Import en Vercel
3. Environment Variables:
   - `ADMIN_TOKEN=tu_token_secreto` (crear/editar/borrar)
   - `PANEL_PASSWORD=luau2026` (entrar al panel HTML)
4. Deploy

**Nota:** En Vercel el filesystem es de solo lectura en runtime. Para producción usa MongoDB/Supabase o Vercel KV. Este JSON sirve para local y demos.

## Endpoints
- `GET /api` — info
- `GET /api/v1` — lista scripts
- `GET /api/v1/:id` — script + code JSON
- `GET /api/v1/:id/raw` — solo código (para HttpGet)
- `POST /api/v1` — crear (header `x-admin-token`)
- `PUT /api/v1/:id` — editar
- `DELETE /api/v1/:id` — borrar

## Roblox
```lua
loadstring(game:HttpGet("https://TU_DOMINIO.vercel.app/api/v1/203028932093/raw"))()
```

## Panel password
Default: `luau2026` — cámbiala en `public/index.html` (`PANEL_PASSWORD`) y/o env `PANEL_PASSWORD`.
