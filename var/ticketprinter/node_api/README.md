# ticketprinter Bridge API (Node.js)

Minimal Express proxy that forwards requests to the existing Flask server so the Node droplet does **not** need a copy of `app.db`.

## Files
- `node_api/src/server.js` – REST API proxy implementation.
- `node_api/package.json` – dependencies and scripts.

## Run locally
```bash
cd node_api
npm install
FLASK_BASE_URL=http://localhost:5000 API_KEY=public-facing-key BRIDGE_API_KEY=flask-bridge-key PORT=5085 npm start
```
- `FLASK_BASE_URL` points to the Flask server that has access to `app.db` (default: `http://localhost:5000`).
- `API_KEY` protects the Node-facing API (optional but recommended). Send it as `x-api-key: <key>` or `Authorization: Bearer <key>`.
- `BRIDGE_API_KEY` is passed through to Flask as `x-api-key` to hit the bridge routes (must match `BRIDGE_API_KEY` on the Flask side).
- `PORT` defaults to `5085`.

## Endpoints (proxied to Flask)
- `GET /api/health`
- `GET /api/tickets/:uuid`
- `GET /api/tickets/:uuid/full`
- `GET /api/tickets/:uuid/checklist`
- `GET /api/tickets/:uuid/images`
- `PATCH /api/tickets/:uuid/checklist/:statusId`

All ticket lookups key off the existing `tickets.uuid` column, which is what you should encode into the QR (e.g. `https://your-domain/api/tickets/<uuid>/full`).

## Droplet deployment notes
- Deploy `node_api` on the droplet; keep Flask reachable (public or via VPN/tunnel) and set `FLASK_BASE_URL` accordingly.
- Ensure `BRIDGE_API_KEY` matches on both Node and Flask.
- Install Node 18+ (for built-in `fetch`).
- `npm ci --omit=dev` to install runtime deps.
- Run with a process manager (systemd, pm2, docker) and open only the chosen `PORT`; keep API keys secret.
