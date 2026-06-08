import { Pool } from "pg";

const RESETTABLE_TABLES = [
  "inv_inventory",
  "inv_delivery_items",
  "inv_deliveries",
  "inv_requests",
  "inv_orders",
  "inv_items",
  "inv_images",
  "inv_item_groups",
  "inv_locations",
  "inv_suppliers",
];

if (!process.env.INV_DATABASE_URL) {
  throw new Error("Missing INV_DATABASE_URL for app reset.");
}

const pool = new Pool({
  connectionString: process.env.INV_DATABASE_URL,
  ssl:
    process.env.INV_DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

export async function resetAppData(_req, res) {
  try {
    const quotedTables = RESETTABLE_TABLES
      .map((tableName) => `public.${tableName}`)
      .join(", ");

    await pool.query(
      `truncate table ${quotedTables} restart identity cascade;`,
    );

    res.json({
      ok: true,
      message:
        "Application data reset complete. User/auth tables were not modified.",
      tablesReset: RESETTABLE_TABLES,
    });
  } catch (error) {
    const message =
      typeof error?.message === "string" && error.message.length > 0
        ? error.message
        : "Failed to reset application data.";

    res.status(500).json({ error: message });
  }
}
