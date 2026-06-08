require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const API_KEY =
  process.env.API_KEY ||
  process.env.X_API_KEY ||
  process.env.AUTH_TOKEN ||
  process.env.BEARER_TOKEN;
const BRIDGE_KEY = process.env.BRIDGE_API_KEY || process.env.FLASK_API_KEY;
// Upstream Flask is local on the same droplet by default.
const FLASK_BASE_URL =
  process.env.FLASK_BASE_URL || "http://127.0.0.1:5082";
const PORT = Number(process.env.PORT || 5085);

// Simple in-memory store for pushed tickets (keyed by uuid and id)
const ticketsByUuid = new Map();
const ticketsById = new Map();
const pendingRequests = new Set();

function storeTicket(payload) {
  if (!payload || !payload.ticket) return false;
  const ticket = payload.ticket;
  const uuid = ticket.uuid;
  const id = ticket.id != null ? String(ticket.id) : null;
  if (!uuid && !id) return false;
  if (uuid) ticketsByUuid.set(String(uuid), payload);
  if (id) ticketsById.set(String(id), payload);
  return true;
}

function getStoredTicket(ref) {
  if (!ref) return null;
  const key = String(ref);
  return ticketsByUuid.get(key) || ticketsById.get(key) || null;
}

function shouldFallbackToCache(err) {
  if (!err) return true;
  if (typeof err.status !== "number") return true;
  return err.status >= 500;
}

async function fetchFullTicketFromFlask(ticketRef) {
  return callFlask(`/api/bridge/tickets/${ticketRef}/full?enqueue=0`);
}

function addPending(ticketRef) {
  if (!ticketRef) return;
  const ref = String(ticketRef);
  pendingRequests.add(ref);
  /* eslint-disable no-console */
  console.log(
    `[bridge] pending request added ticketRef=${ref} total=${pendingRequests.size}`
  );
  /* eslint-enable no-console */
}

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const headerKey = req.get("x-api-key");
  const authHeader = req.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
  const token = headerKey || bearer;
  if (token === API_KEY) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.use(authMiddleware);

// Verbose request logging for visibility
app.use((req, _res, next) => {
  const bodyInfo =
    req.method === "GET" || req.method === "HEAD"
      ? ""
      : ` body=${JSON.stringify(req.body).slice(0, 200)}`;
  /* eslint-disable no-console */
  console.log(`[bridge] inbound ${req.method} ${req.originalUrl}${bodyInfo}`);
  /* eslint-enable no-console */
  next();
});

// Endpoint for clients (e.g., the Flask ticket printer) to push full ticket payloads
app.post("/api/push/tickets", (req, res) => {
  const ok = storeTicket(req.body);
  /* eslint-disable no-console */
  console.log(
    `[bridge] push received ok=${ok} uuid=${req.body?.ticket?.uuid} id=${req.body?.ticket?.id}`
  );
  /* eslint-enable no-console */
  if (!ok) {
    return res.status(400).json({ error: "missing ticket in payload" });
  }
  return res.json({ ok: true });
});

// Endpoint for clients (printers) to poll pending ticket requests
app.get("/api/pending/requests", (_req, res) => {
  const list = Array.from(pendingRequests);
  /* eslint-disable no-console */
  console.log(
    `[bridge] pending poll count=${list.length} tickets=${list.join(",")}`
  );
  /* eslint-enable no-console */
  res.json({ requests: list });
});

// Endpoint to enqueue pending ticket requests (e.g., from Flask when user hits print)
app.post("/api/pending/requests", (req, res) => {
  const body = req.body || {};
  const refs = Array.isArray(body.requests) ? body.requests : [];
  let added = 0;
  for (const ref of refs) {
    if (!ref) continue;
    addPending(ref);
    added += 1;
  }
  /* eslint-disable no-console */
  console.log(
    `[bridge] pending add count=${added} tickets=${refs
      .map((r) => String(r))
      .join(",")}`
  );
  /* eslint-enable no-console */
  res.json({ ok: true, added });
});

// Endpoint for printers to consume (clear) pending requests after printing
app.post("/api/pending/consume", (req, res) => {
  const body = req.body || {};
  const refs = Array.isArray(body.requests) ? body.requests : [];
  let removed = 0;
  for (const ref of refs) {
    if (!ref) continue;
    const key = String(ref);
    if (pendingRequests.delete(key)) {
      removed += 1;
    }
  }
  /* eslint-disable no-console */
  console.log(
    `[bridge] pending consume removed=${removed} tickets=${refs
      .map((r) => String(r))
      .join(",")} remaining=${pendingRequests.size}`
  );
  /* eslint-enable no-console */
  res.json({ ok: true, removed, remaining: pendingRequests.size });
});

async function callFlask(path, { method = "GET", body, headers } = {}) {
  if (!FLASK_BASE_URL) {
    const err = new Error("upstream Flask disabled (no FLASK_BASE_URL)");
    err.status = 503;
    err.data = { error: "upstream disabled" };
    throw err;
  }
  const url = `${FLASK_BASE_URL}${path}`;
  const finalHeaders = {
    Accept: "application/json",
    ...(body ? { "Content-Type": "application/json" } : {}),
    ...headers,
  };
  if (BRIDGE_KEY) {
    finalHeaders["x-api-key"] = BRIDGE_KEY;
  }

  /* eslint-disable no-console */
  console.log(
    `[bridge] outbound ${method} ${url} headers=${JSON.stringify(
      finalHeaders
    ).slice(0, 200)} body=${body ? JSON.stringify(body).slice(0, 200) : ""}`
  );
  /* eslint-enable no-console */

  const resp = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_err) {
    data = text;
  }

  /* eslint-disable no-console */
  console.log(
    `[bridge] upstream response ${resp.status} ${url} body_len=${text.length} body_preview=${text.slice(
      0,
      200
    )}`
  );
  /* eslint-enable no-console */

  if (!resp.ok) {
    const err = new Error(`Flask request failed (${resp.status})`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

app.get("/api/health", async (_req, res, next) => {
  try {
    const upstream = await callFlask("/api/bridge/health");
    res.json({
      ok: true,
      proxying: true,
      flask: upstream,
      apiKeyProtected: !!API_KEY,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

app.get("/api/tickets/:uuid", async (req, res, next) => {
  const ticketRef = req.params.uuid;
  /* eslint-disable no-console */
  console.log(`[bridge] poll ticketRef=${ticketRef} route=/api/tickets`);
  /* eslint-enable no-console */
  try {
    const fresh = await fetchFullTicketFromFlask(ticketRef);
    if (fresh) {
      storeTicket(fresh);
      /* eslint-disable no-console */
      console.log(`[bridge] served from upstream ticketRef=${ticketRef}`);
      /* eslint-enable no-console */
      return res.json(fresh);
    }
  } catch (err) {
    if (!shouldFallbackToCache(err)) {
      return next(err);
    }
    /* eslint-disable no-console */
    console.log(
      `[bridge] upstream fetch failed, falling back to cache ticketRef=${ticketRef} status=${
        err?.status || "unknown"
      }`
    );
    /* eslint-enable no-console */
  }

  const stored = getStoredTicket(ticketRef);
  if (stored) {
    /* eslint-disable no-console */
    console.log(`[bridge] served from cache ticketRef=${ticketRef}`);
    /* eslint-enable no-console */
    return res.json(stored);
  }
  try {
    /* eslint-disable no-console */
    console.log(
      `[bridge] pending ticket (not cached) ticketRef=${ticketRef} retry=500ms`
    );
    /* eslint-enable no-console */
    addPending(ticketRef);
    res.setHeader("Retry-After", "1");
    res.status(202).json({ status: "pending", ticketRef, retryAfterMs: 500 });
  } catch (err) {
    next(err);
  }
});

app.get("/api/tickets/:uuid/full", async (req, res, next) => {
  const ticketRef = req.params.uuid;
  /* eslint-disable no-console */
  console.log(`[bridge] poll ticketRef=${ticketRef} route=/api/tickets/full`);
  /* eslint-enable no-console */
  try {
    const fresh = await fetchFullTicketFromFlask(ticketRef);
    if (fresh) {
      storeTicket(fresh);
      /* eslint-disable no-console */
      console.log(`[bridge] served from upstream (full) ticketRef=${ticketRef}`);
      /* eslint-enable no-console */
      return res.json(fresh);
    }
  } catch (err) {
    if (!shouldFallbackToCache(err)) {
      return next(err);
    }
    /* eslint-disable no-console */
    console.log(
      `[bridge] upstream fetch failed, falling back to cache (full) ticketRef=${ticketRef} status=${
        err?.status || "unknown"
      }`
    );
    /* eslint-enable no-console */
  }

  const stored = getStoredTicket(ticketRef);
  if (stored) {
    /* eslint-disable no-console */
    console.log(`[bridge] served from cache (full) ticketRef=${ticketRef}`);
    /* eslint-enable no-console */
    return res.json(stored);
  }
  try {
    /* eslint-disable no-console */
    console.log(
      `[bridge] pending full payload (not cached) ticketRef=${ticketRef} retry=500ms`
    );
    /* eslint-enable no-console */
    addPending(ticketRef);
    res.setHeader("Retry-After", "1");
    res.status(202).json({ status: "pending", ticketRef, retryAfterMs: 500 });
  } catch (err) {
    next(err);
  }
});

app.get("/api/tickets/:uuid/checklist", async (req, res, next) => {
  const ticketRef = req.params.uuid;
  /* eslint-disable no-console */
  console.log(
    `[bridge] poll ticketRef=${ticketRef} route=/api/tickets/checklist`
  );
  /* eslint-enable no-console */
  try {
    const fresh = await fetchFullTicketFromFlask(ticketRef);
    if (fresh) {
      storeTicket(fresh);
      const checklist = Array.isArray(fresh.checklist) ? fresh.checklist : [];
      /* eslint-disable no-console */
      console.log(`[bridge] served checklist from upstream ticketRef=${ticketRef}`);
      /* eslint-enable no-console */
      return res.json({
        ticketId: fresh.ticket ? fresh.ticket.id : null,
        checklist,
      });
    }
  } catch (err) {
    if (!shouldFallbackToCache(err)) {
      return next(err);
    }
    /* eslint-disable no-console */
    console.log(
      `[bridge] upstream checklist fetch failed, falling back to cache ticketRef=${ticketRef} status=${
        err?.status || "unknown"
      }`
    );
    /* eslint-enable no-console */
  }

  const stored = getStoredTicket(ticketRef);
  if (stored && stored.checklist) {
    /* eslint-disable no-console */
    console.log(`[bridge] served checklist from cache ticketRef=${ticketRef}`);
    /* eslint-enable no-console */
    return res.json({
      ticketId: stored.ticket ? stored.ticket.id : null,
      checklist: stored.checklist,
    });
  }
  try {
    /* eslint-disable no-console */
    console.log(
      `[bridge] pending checklist (not cached) ticketRef=${ticketRef} retry=500ms`
    );
    /* eslint-enable no-console */
    addPending(ticketRef);
    res.setHeader("Retry-After", "1");
    res
      .status(202)
      .json({ status: "pending", ticketRef, checklist: [], retryAfterMs: 500 });
  } catch (err) {
    next(err);
  }
});

app.get("/api/tickets/:uuid/images", async (req, res, next) => {
  const ticketRef = req.params.uuid;
  /* eslint-disable no-console */
  console.log(`[bridge] poll ticketRef=${ticketRef} route=/api/tickets/images`);
  /* eslint-enable no-console */
  try {
    const fresh = await fetchFullTicketFromFlask(ticketRef);
    if (fresh) {
      storeTicket(fresh);
      const images = Array.isArray(fresh.images) ? fresh.images : [];
      /* eslint-disable no-console */
      console.log(`[bridge] served images from upstream ticketRef=${ticketRef}`);
      /* eslint-enable no-console */
      return res.json({
        ticketId: fresh.ticket ? fresh.ticket.id : null,
        images,
      });
    }
  } catch (err) {
    if (!shouldFallbackToCache(err)) {
      return next(err);
    }
    /* eslint-disable no-console */
    console.log(
      `[bridge] upstream images fetch failed, falling back to cache ticketRef=${ticketRef} status=${
        err?.status || "unknown"
      }`
    );
    /* eslint-enable no-console */
  }

  const stored = getStoredTicket(ticketRef);
  if (stored && stored.images) {
    /* eslint-disable no-console */
    console.log(`[bridge] served images from cache ticketRef=${ticketRef}`);
    /* eslint-enable no-console */
    return res.json({
      ticketId: stored.ticket ? stored.ticket.id : null,
      images: stored.images,
    });
  }
  try {
    /* eslint-disable no-console */
    console.log(
      `[bridge] pending images (not cached) ticketRef=${ticketRef} retry=500ms`
    );
    /* eslint-enable no-console */
    addPending(ticketRef);
    res.setHeader("Retry-After", "1");
    res.status(202).json({
      status: "pending",
      ticketRef,
      ticketId: null,
      images: [],
      retryAfterMs: 500,
    });
  } catch (err) {
    next(err);
  }
});

app.patch("/api/tickets/:uuid/checklist/:statusId", async (req, res, next) => {
  const ticketRef = req.params.uuid;
  const statusId = Number(req.params.statusId);
  try {
    if (!Number.isFinite(statusId)) {
      return res.status(400).json({ error: "invalid statusId" });
    }
    if (!FLASK_BASE_URL) {
      return res.status(503).json({
        error: "upstream disabled",
        detail: "Set FLASK_BASE_URL to enable DB updates.",
      });
    }

    const update = req.body || {};
    const updated = await callFlask(
      `/api/bridge/tickets/${ticketRef}/checklist/${statusId}`,
      { method: "PATCH", body: update }
    );

    const stored = getStoredTicket(ticketRef);
    if (stored && Array.isArray(stored.checklist)) {
      const idx = stored.checklist.findIndex(
        (item) => Number(item.statusId) === statusId
      );
      if (idx >= 0) {
        stored.checklist[idx] = { ...stored.checklist[idx], ...updated };
        storeTicket(stored);
        /* eslint-disable no-console */
        console.log(
          `[bridge] synced checklist to cache ticketRef=${ticketRef} statusId=${statusId}`
        );
        /* eslint-enable no-console */
      }
    }

    return res.json(updated);
  } catch (err) {
    next(err);
  }
});

app.use((err, _req, res, _next) => {
  /* eslint-disable no-console */
  console.error("Unexpected error:", err);
  /* eslint-enable no-console */
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "internal server error",
    details: err.data || null,
  });
});

app.listen(PORT, () => {
  /* eslint-disable no-console */
  console.log(
    `ticketprinter bridge API on port ${PORT}, upstream disabled (cache-only)${
      API_KEY ? " [auth enabled]" : ""
    }`
  );
  console.log(
    `[bridge] startup cache-only mode PORT=${PORT}`
  );
  /* eslint-enable no-console */
});
