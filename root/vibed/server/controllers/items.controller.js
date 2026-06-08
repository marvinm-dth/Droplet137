import { supabaseClient } from "../libs/supabaseClient.js";

const TABLE_NAME = "inv_items";
const ITEM_SELECT = `
  *,
  supplier:inv_suppliers (
    id,
    name
  ),
  item_group:inv_item_groups!group_id (
    id,
    name
  ),
  inventory:inv_inventory (
    count
  ),
  default_location:inv_locations (
    id,
    name
  ),
  creator:inv_user (
    id,
    name,
    email
  )
`;

function parseFilterObject(rawFilters) {
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

export function applyFilters(query, filters = {}) {
  let nextQuery = query;

  for (const [column, condition] of Object.entries(filters)) {
    if (condition === undefined) continue;

    if (
      condition === null ||
      typeof condition !== "object" ||
      Array.isArray(condition)
    ) {
      nextQuery = nextQuery.eq(column, condition);
      continue;
    }

    for (const [operator, value] of Object.entries(condition)) {
      if (value === undefined) continue;

      if (operator === "eq") nextQuery = nextQuery.eq(column, value);
      if (operator === "neq") nextQuery = nextQuery.neq(column, value);
      if (operator === "gt") nextQuery = nextQuery.gt(column, value);
      if (operator === "gte") nextQuery = nextQuery.gte(column, value);
      if (operator === "lt") nextQuery = nextQuery.lt(column, value);
      if (operator === "lte") nextQuery = nextQuery.lte(column, value);
      if (operator === "like") nextQuery = nextQuery.like(column, value);
      if (operator === "ilike") nextQuery = nextQuery.ilike(column, value);
      if (operator === "in" && Array.isArray(value))
        nextQuery = nextQuery.in(column, value);
      if (operator === "contains") nextQuery = nextQuery.contains(column, value);
      if (operator === "is") nextQuery = nextQuery.is(column, value);
    }
  }

  return nextQuery;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export async function index(req, res) {
  const filters = parseFilterObject(req.query.filters ?? req.body?.filters);
  const includeNonSupplierItems = toBoolean(
    req.query.include_non_supplier_items,
    true,
  );
  const searchQuery =
    typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitParam = toNumber(req.query.limit);
  const offsetParam = toNumber(req.query.offset);
  const pageParam = toNumber(req.query.page);
  const pageSizeParam = toNumber(req.query.pageSize);
  const orderBy = req.query.sort_by ?? req.query.orderBy;
  const sortDir = req.query.sort_dir ?? (req.query.ascending !== "false" ? "asc" : "dsc");
  const ascending = sortDir !== "dsc";
  const hasPage = pageParam !== null && pageParam > 0;
  const pageSize =
    pageSizeParam !== null && pageSizeParam > 0
      ? pageSizeParam
      : limitParam !== null && limitParam > 0 ? limitParam : 10;
  const page = hasPage ? pageParam : Math.floor((offsetParam ?? 0) / pageSize) + 1;
  const offset = hasPage ? (page - 1) * pageSize : offsetParam ?? 0;
  const rangeTo = offset + pageSize - 1;

  const { count: totalItems, error: totalItemsError } = await supabaseClient
    .from(TABLE_NAME)
    .select("*", { count: "exact", head: true });

  if (totalItemsError) {
    res.status(500).json({ error: totalItemsError.message });
    return;
  }

  let query = supabaseClient
    .from(TABLE_NAME)
    .select(ITEM_SELECT, { count: "exact" });
  query = applyFilters(query, filters);

  if (!includeNonSupplierItems) {
    query = query.not("supplier_id", "is", null);
  }

  if (searchQuery.length > 0) {
    const escapedSearch = searchQuery.replace(/,/g, "\\,");
    query = query.or(
      [
        `name.ilike.%${escapedSearch}%`,
        `brand.ilike.%${escapedSearch}%`,
        `sku_number.ilike.%${escapedSearch}%`,
        `department.ilike.%${escapedSearch}%`,
      ].join(","),
    );
  }

  if (typeof orderBy === "string" && orderBy.length > 0) {
    query = query.order(orderBy, { ascending });
  }

  query = query.range(offset, rangeTo);

  const { data, error, count: totalFilteredItems } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const safeTotalFilteredItems = totalFilteredItems ?? 0;
  const totalPages = safeTotalFilteredItems > 0
    ? Math.ceil(safeTotalFilteredItems / pageSize)
    : 0;

  res.json({
    data: data ?? [],
    pagination: {
      page,
      pageSize,
      totalItems: totalItems ?? 0,
      totalFilteredItems: safeTotalFilteredItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
}

export async function show(req, res) {
  const { id } = req.params;
  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select(ITEM_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  res.json(data);
}

export async function create(req, res) {
  const payload = req.body;

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .insert(payload)
    .select(ITEM_SELECT)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
}

export async function update(req, res) {
  const { id } = req.params;
  const payload = req.body;

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .update(payload)
    .eq("id", id)
    .select(ITEM_SELECT)
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  res.json(data);
}

export async function destroy(req, res) {
  const { id } = req.params;

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .delete()
    .eq("id", id)
    .select(ITEM_SELECT)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Item not found." });
    return;
  }

  res.json(data);
}

