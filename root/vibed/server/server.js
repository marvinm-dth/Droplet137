import "./load-env.js";

import cors from "cors";
import express from "express";
import morgan from "morgan";
import path from "node:path";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";

import { auth } from "./auth.js";
import itemsRouter from "./routers/items.routes.js";
import imagesRouter from "./routers/images.routes.js";
import suppliersRouter from "./routers/suppliers.routes.js";
import requestsRouter from "./routers/requests.routes.js";
import ordersRouter from "./routers/orders.routes.js";
import deliveriesRouter from "./routers/deliveries.routes.js";
import deliveryItemsRouter from "./routers/deliveryItems.routes.js";
import inventoryRouter from "./routers/inventory.routes.js";
import locationsRouter from "./routers/locations.routes.js";
import itemGroupsRouter from "./routers/itemGroups.routes.js";
import usersRouter from "./routers/users.routes.js";
import appResetRouter from "./routers/appReset.routes.js";
import { supabaseClient } from "./libs/supabaseClient.js";

const app = express();
const port = Number(process.env.INV_PORT ?? 3001);
const isDev = process.env.NODE_ENV !== "production";
const isAppResetEnabled = process.env.INV_ENABLE_APP_RESET === "true";

app.use(morgan("dev"));
app.use(
  cors({
    origin: isDev
      ? true
      : (process.env.INV_CLIENT_URL ?? "http://localhost:3000"),
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Public test route: returns all items without requiring authentication
app.get("/api/test", async (_req, res) => {
   const { data, error } = await supabaseClient
     .from("inv_tests")
     .select("*")
     .order("created_at", { ascending: false });

   if (error) {
     res.status(500).json({ error: error.message });
     return;
   }

   res.json({
     data: data ?? [],
     count: data?.length ?? 0,
   });
});

// Better Auth handler (must be before express.json())
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());
app.use(express.static(path.join(process.cwd(), "public")));

app.get("/api/me", async (req, res) => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(session);
});

app.use("/api/items", itemsRouter);
app.use("/api/images", imagesRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/deliveries", deliveriesRouter);
app.use("/api/delivery-items", deliveryItemsRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/item-groups", itemGroupsRouter);
app.use("/api/item-groupings", itemGroupsRouter);
app.use("/api/users", usersRouter);

if (isAppResetEnabled) {
  app.use("/api/app-reset", appResetRouter);
}

app.listen(port, () => {
  console.log(`Server listening on ${process.env.INV_HOST}:${port}`);
});
