import {
  applyFilters,
  buildCrudController,
} from "./crud.controller.js";
import { supabaseClient } from "../libs/supabaseClient.js";

const TABLE_NAME = "inv_locations";
const LOCATION_SELECT = `
  *,
  parent:inv_locations (
    id,
    name
  ),
  inventory:inv_inventory(
    id,
    item_id,
    item_snapshot,
    is_received,
    item:inv_items (
      id,
      name
    )
  )
`;

const baseController = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Location",
  selectClause: LOCATION_SELECT,
  searchableColumns: ["name", "notes"],
});

function parseFilters(rawFilters) {
  if (!rawFilters) return {};

  if (typeof rawFilters === "string") {
    try {
      return JSON.parse(rawFilters);
    } catch {
      return {};
    }
  }

  if (typeof rawFilters === "object") {
    return rawFilters;
  }

  return {};
}

function isTruthy(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export async function index(req, res) {
  const receivedOnly = isTruthy(req.query.inventory_received_only);
  if (!receivedOnly) {
    return baseController.index(req, res);
  }

  const filters = parseFilters(req.query.filters ?? req.body?.filters);
  const searchQuery =
    typeof req.query.q === "string" ? req.query.q.trim() : "";
  const rawPage = Number(req.query.page);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawPageSize = Number(req.query.pageSize);
  const pageSize =
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 10;
  const offset = (page - 1) * pageSize;
  const rangeTo = offset + pageSize - 1;
  const orderBy = req.query.sort_by ?? req.query.orderBy;
  const sortDir =
    req.query.sort_dir ?? (req.query.ascending !== "false" ? "asc" : "desc");
  const ascending = sortDir !== "desc";

  let query = supabaseClient
    .from(TABLE_NAME)
    .select(LOCATION_SELECT, { count: "exact" });

  query = applyFilters(query, filters);

  if (searchQuery.length > 0) {
    const escapedSearch = searchQuery.replace(/,/g, "\\,");
    query = query.or(`name.ilike.%${escapedSearch}%,notes.ilike.%${escapedSearch}%`);
  }

  query = query.eq("inventory.is_received", true);

  if (typeof orderBy === "string" && orderBy.length > 0) {
    query = query.order(orderBy, { ascending });
  }

  query = query.range(offset, rangeTo);

  const { data, error, count } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const safeTotalFilteredItems = count ?? 0;
  const totalPages =
    safeTotalFilteredItems > 0 ? Math.ceil(safeTotalFilteredItems / pageSize) : 0;

  res.json({
    data: data ?? [],
    pagination: {
      page,
      pageSize,
      totalItems: safeTotalFilteredItems,
      totalFilteredItems: safeTotalFilteredItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
}

export const { show, create, update, destroy } = baseController;

