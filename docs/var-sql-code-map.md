# `/var/sql` Code Map

This document maps the code copied from the droplet's `/var/sql` directory. The tree is highly developmental: several files are active PM2 services, while many adjacent files are older experiments, alternate ports, backups, or one-off utilities. The safest way to read this directory is by grouping files by workflow instead of assuming every `server*.js` file is part of one app.

The PM2 process map used for this document is committed at [`pm2/processes.json`](../pm2/processes.json). Runtime data, `.env` files, dependencies, TLS keys, upload folders, and large generated assets were intentionally excluded from the repository.

## Active PM2 Services

These are the `/var/sql` processes that PM2 was configured to run when this repo snapshot was taken.

| PM2 name | Status in PM2 dump | Entrypoint | Working directory | Purpose |
| --- | --- | --- | --- | --- |
| `checklist` | online | `var/sql/checklist.py` | `/var/sql` | Early Flask staged checklist form, serving `/stage1` through `/stage7` and submit endpoints. |
| `server5016` | online | `var/sql/server5016.js` | `/var/sql` | Supabase CRUD API for `all_tags` on port `5016`. |
| `server5017` | online | `var/sql/server5017.js` | `/var/sql` | Auth plus task CRUD for `all_tasks`, using `all_users` for token checks. |
| `server5019` | online | `var/sql/server5019.js` | `/var/sql` | User, employee, and employee/task API over `all_users`, `all_employees`, and `all_tasks`. |
| `server5021` | online | `var/sql/server5021.js` | `/var/sql` | Orca conversations/messaging API over `orca_conversations`, with user profile/avatar endpoints. |
| `server5025` | online | `var/sql/server5025.js` | `/var/sql` | Broader CRUD API for employees, projects, tasks, and assignments. |
| `server5027` | online | `var/sql/server5027.js` | `/var/sql` | Another tag CRUD service for `all_tags`; overlaps with `server5016`. |
| `server5029` | online | `var/sql/checklistv3-5029/server.js` | `/var/sql/checklistv3-5029` | Current checklist v3 API and SPA host on its configured `PORT_CK`. |
| `server5030` | online | `var/sql/checklistv2/server5030.js` | `/var/sql/checklistv2` | Checklist v2 Express/EJS app on port `5030`. |
| `server5050` | online | `var/sql/functionality-testing-ngrok/server5050.js` | `/var/sql/functionality-testing-ngrok` | Static test/PWA camera and scanner server on port `5050`. |
| `server5077` | online | `var/sql/server5077.js` | `/var/sql` | HTTPS inspection/data service with `/api/notion`, `/api/data`, image serving, and SPA fallback. |
| `server5078` | online | `var/sql/server5078.js` | `/var/sql` | Media capture/listing service for photos, videos, sessions, thumbnails, and static UI. |
| `server5080` | online | `var/sql/server5080.js` | `/var/sql` | WebSocket bridge for Raspberry Pi printing plus `ticket_templates` CRUD and intake/print endpoints. |
| `server5085` | stopped | `var/sql/server5085.js` | `/var/sql` | Stopped in PM2 dump. File appears to be a printing/API bridge variant. |
| `server5090` | online | `var/sql/server5090.js` | `/var/sql` | Image-only bridge on port `5090`, exposing `/api/print-image`. |
| `server5091` | stopped | `var/sql/server5091.js` | `/var/sql` | Stopped in PM2 dump. Home Depot item lookup and receive/missing tracking endpoints. |
| `server5093` | online | `var/sql/web-admin/server5093.js` | `/var/sql/web-admin` | CSV/image web admin for Supabase item data on port `5093`. |
| `image5081` | online | `var/sql/image5081.js` | `/var/sql` | Image upload/list/serve helper rooted in allowed local folders. |
| `image5091` | online | `var/sql/image5091.js` | `/var/sql` | Image upload/serve helper, also using port `5091`; note port collision risk with stopped `server5091`. |
| `translator5040` | online | `var/sql/translator5040.js` | `/var/sql` | OpenAI-backed translation cache API using Supabase table `ai_translations`. |
| `discord-openphone` | online | `var/sql/discord-openphone.js` | `/var/sql` | OpenPhone-to-Discord relay over HTTPS. Token was redacted to `DISCORD_BOT_TOKEN`. |

## Version Families

### Materials and Inventory Flask App

Primary files:

- `app3-5026.py`
- `app3-5026-2.py`
- `app3-5026-3.py`
- `app3_5026.py`
- `templates/*`
- `static/*`
- `amazon_spider/*`
- `homedepot_spider/*`

This family is a Flask/Supabase materials, purchasing, delivery, and inventory system. It has many route groups:

- Authentication and session pages: `/login`, `/main`, `/logout`.
- Supplier/material workflows: `/select_supplier`, `/item_supplier`, `/add_supplier`, `/add_material/<supplier_id>`, `/fetch_item_details`.
- Orders and deliveries: `/add_order`, `/submit-order`, `/approval_order/<order_id>`, `/delivery/<order_id>`, `/submit_delivery`, `/view_delivery/<delivery_id>`.
- Inventory flows: `/inventory`, `/inventory_onhand`, `/add_inventory_used`, `/return_inventory`, `/inventory_location`, barcode scanning, and QR use routes.
- Dashboards and notifications: `/dashboard`, `/api/dashboard`, `/api/request_dashboard`, notification read/dismiss endpoints.
- Home Depot import/search screens: `/home_depot_items`, `/home_depot_item/<material_id>`.
- Bulk update flows: `/bulk_material_update`, `/submit_bulk_material`, `/bulk_upc_update`, `/submit_bulk_upc`.

The repeated `app3-5026*` files are close variants of the same app. The later-looking variants add request-material flows, missing/scan endpoints, and extra update/delete routes. The matching `templates/` files are shared by these Flask versions.

Runtime folders referenced by these files include `/var/sql/dth_materials/...` for downloaded images, receipts, order files, delivery files, receive files, location images, and barcode images. Those folders were excluded from Git because they are app data, not source.

### Checklist Apps

Primary files:

- `checklist.py`
- `checklistv1/*`
- `checklistv2/*`
- `checklistv3-5029/*`

There are three visible generations:

| Version | Main entry | Style | Notes |
| --- | --- | --- | --- |
| Early Flask | `checklist.py` | Flask pages | Simple staged form: `/stage1` through `/stage7`. PM2 runs this as `checklist`. |
| v1 | `checklistv1/server5024.js` | Express with pages/models/routes | Older Supabase-backed checklist implementation with manager/staff pages and model files for employees, projects, items, checklists, and templates. |
| v2 | `checklistv2/server5030.js` | Express/EJS app | PM2 runs this as `server5030`. Provides pages under `/checklists/...`, API routes for projects, milestones, tasks, task checklists, task items, checklist templates, item templates, users, and SSE notifications. |
| v3 | `checklistv3-5029/server.js` | Express 5 API plus static SPAs | PM2 runs this as `server5029`. Domain-driven structure under `domain/`, shared `core/` helpers, and protected `/api/v1/...` routers. Serves `/admin` and `/builders` SPAs. |

Checklist v2 and v3 are strongly linked by concept but not by direct imports. They share domain vocabulary: projects, milestones, tasks, checklists, items, users, submissions/media, and attachments. v3 looks like a rewrite with reusable base models, DTOs, mixins, route generators, auth middleware, and domain routers.

### Ported Node APIs for Legacy Tables

Primary files:

- `server5016.js`
- `server5017.js`
- `server5019.js`
- `server5021.js`
- `server5022.js`
- `server5025.js`
- `server5027.js`
- `server5024.js`
- `server5024-s.js`
- `server5026.js`
- `tempimageserver-5024.js`

These are mostly small Express services over Supabase tables. The naming convention is port-oriented, not feature-oriented. Several files contain older commented implementations above newer active code.

Observed table and route linkages:

- `all_tags`: `server5016.js`, `server5027.js`, `server5026.js`.
- `all_tasks`: `server5017.js`, `server5019.js`, `server5022.js`, `server5025.js`.
- `all_users`: `server5017.js`, `server5019.js`, `server5021.js`.
- `all_employees`: `server5019.js`, `server5025.js`.
- `all_projects`: `server5025.js`.
- `orca_conversations`: `server5021.js`.
- `ticket_templates`: `server5080.js`.
- `home_depot_items` and `all_items_tracking`: `server5091.js`.

These should be treated as experimental service slices around the same Supabase backend. If consolidating later, start from route/table overlap rather than filenames.

### Printing, Labeling, and Image Bridges

Primary files:

- `server5080.js`
- `server5090.js`
- `image5081.js`
- `image5091.js`
- `label*.js`
- `label-listener/*`
- `LabelL.js`
- `static/*`
- `images/*`

This group handles print job forwarding, image uploads, label previews, and label/PDF rendering experiments.

Key linkages:

- `server5080.js` creates an HTTP/WebSocket bridge. Raspberry Pi clients connect by WebSocket; REST clients post to `/api/print`, `/api/intake`, and `/api/templates`.
- `server5090.js` is a narrower image-only print bridge exposing `/api/print-image`.
- `image5081.js` and `image5091.js` upload and serve images from allowed folders. `image5091.js` uses port `5091`, which conflicts with stopped PM2 process `server5091` if both are started at once.
- The many `label*.js` files are iterative label-rendering services. They commonly use `@supabase/supabase-js`, `canvas`, `pdfjs-dist`, `pdfkit`, or local preview endpoints such as `/preview`, `/preview/image/:index?`, `/preview/pdf`, `/elements-config`, and `/last-order`.
- `label-listener/*` appears to be a Supabase-driven background listener for label events.

The label files are best understood as a scratch lineage. Names like `labelA*`, `labelB*`, and `labelBA` through `labelBG` are not self-documenting versions; compare endpoints and dependencies before choosing a canonical file.

### Media, Inspection, and Static Tools

Primary files and folders:

- `server-5023.js`
- `server5077.js`
- `server5078.js`
- `inspections/*`
- `web/*`
- `functionality-testing-ngrok/*`
- `public/*`

`server-5023.js`, `server5077.js`, and `server5078.js` are related to static UI hosting, image serving, inspection capture, and media/session management.

Observed endpoints:

- `server-5023.js`: `/healthz`, `/image/:filename`, SPA/static fallback.
- `server5077.js`: `/healthz`, `/image/:filename`, `/inspections`, `/api/notion`, `/api/raw`, `/api/data`, static fallback.
- `server5078.js`: `/healthz`, `/image/:filename`, `/upload/photo`, `/upload/video`, `/list/photos`, `/list/videos`, `/list/sessions`, `/admin/build-thumbs`, static fallback.
- `functionality-testing-ngrok/server5050.js`: small static server for scanner/camera pages in `functionality-testing-ngrok/public`.

Runtime photo/video/session folders were excluded from the repo. The source still contains the route and UI structure needed to understand how those assets are addressed.

### Translation and AI Utilities

Primary files:

- `translator5040.js`
- `translator-cn.js`
- `orcaconvert.js`
- `server5032.js`
- `server5032-2.js`

`translator5040.js` is active in PM2. It exposes `POST /translate`, reads `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `OPENAI_API_KEY`, calls OpenAI chat completions, and caches results in Supabase table `ai_translations`.

`translator-cn.js` is a close alternate translation service. `orcaconvert.js` and `server5032*` also use OpenAI/Supabase patterns and appear to be conversion or AI extraction utilities.

### Web Admin

Primary files:

- `web-admin/server5093.js`
- `web-admin/csvuploader.html`
- `web-admin/public/index.html`
- `web-admin/package.json`

PM2 runs `web-admin/server5093.js` as `server5093`. It serves a CSV/image admin UI and exposes:

- `GET /api/items`
- `POST /api/upload-csv`
- `POST /api/items/:id/image`
- `GET /api/health`

It upserts item rows from CSV into Supabase and uploads images to a Supabase Storage bucket, defaulting to `item-images`.

### Scrapers

Primary folders:

- `amazon_spider/*`
- `homedepot_spider/*`

These are Scrapy projects. They likely feed the material/inventory workflows by collecting supplier/catalog data. Their generated `output.json` files were excluded from the committed source.

## Shared Dependencies and Backend

Most Node services under `/var/sql` rely on the top-level `package.json`. Important dependencies include:

- `express`, `cors`, `body-parser`, `multer`, `cookie-parser`, `express-session`
- `@supabase/supabase-js`, `pg`
- `jsonwebtoken`, `bcrypt`, `bcryptjs`
- `pdfkit`, `pdfjs-dist`, `pdf-to-img`, `pdf-image`, `canvas`, `sharp`, `qrcode`
- `openai`, `node-fetch`
- `discord.js`

The common backend is the self-hosted Supabase instance at `http://137.184.148.164:8000`. Most services expect credentials through environment variables, mainly:

- `SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `OPENAI_API_KEY`
- `JWT_SECRET`
- `DISCORD_BOT_TOKEN`

Secrets were not committed. Some hardcoded keys in copied source were replaced with environment variable lookups before pushing.

## Port and Collision Notes

The codebase uses filename/port coupling heavily. Important ports observed:

| Port | Service/file |
| --- | --- |
| `5016` | `server5016.js`, tags API |
| `5017` | `server5017.js`, auth/tasks API |
| `5019` | `server5019.js`, users/employees/tasks API |
| `5020` | `checklist.py`, early Flask checklist |
| `5021` | `server5021.js`, conversations/profile API |
| `5023` | `server-5023.js` and older `app3-5023.py` |
| `5025` | `server5025.js`, employee/project/task API |
| `5026` | `app3-5026*.py` Flask materials app variants |
| `5027` | `server5027.js`, tags API |
| `5029` | `checklistv3-5029`, via `PORT_CK` |
| `5030` | `checklistv2/server5030.js` |
| `5040` | `translator5040.js` |
| `5050` | `functionality-testing-ngrok/server5050.js` |
| `5077` | `server5077.js` |
| `5078` | `server5078.js` |
| `5080` | `server5080.js` |
| `5081` | `image5081.js` |
| `5090` | `server5090.js` |
| `5091` | `image5091.js`; stopped `server5091.js` would also use `5091` |
| `5093` | `web-admin/server5093.js` |
| `7031` | `discord-openphone.js` HTTPS relay |

The `5091` collision is the clearest operational conflict. PM2 has `image5091` online and `server5091` stopped, which avoids the conflict.

## Recommended Reading Order

For future cleanup or consolidation, read in this order:

1. `pm2/processes.json` to see what actually runs.
2. The active PM2 entrypoints listed above.
3. `var/sql/package.json`, then each subproject `package.json`.
4. The Supabase table usage by service family.
5. The many non-PM2 alternates only after identifying the active workflow they were derived from.

## Excluded or Redacted Material

The repo intentionally excludes:

- `node_modules/`
- Python virtual environments and caches
- `.env` and `.env.*`
- TLS cert/key files
- PM2 logs and generated process runtime files
- Upload/media folders and large runtime app data
- Scraper generated output
- Material/order/receipt/image runtime data under `dth_materials`

The following source redactions were made before pushing:

- Discord bot token in `discord-openphone.js` now reads `process.env.DISCORD_BOT_TOKEN`.
- Hardcoded Supabase anon JWTs in older Flask/test files were replaced with environment-variable reads.
- Hardcoded Flask secret values in older Flask copies were replaced with `FLASK_SECRET_KEY` fallback placeholders.

