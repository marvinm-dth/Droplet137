import { supabaseClient } from "../libs/supabaseClient.js";
import path from "node:path";

const TABLE_NAME = "inv_images";

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

export async function index(req, res) {
  const filters = parseFilterObject(req.query.filters ?? req.body?.filters);
  const limit = toNumber(req.query.limit);
  const offset = toNumber(req.query.offset) ?? 0;
  const orderBy = req.query.orderBy;
  const ascending = req.query.ascending !== "false";

  let query = supabaseClient.from(TABLE_NAME).select("*");
  query = applyFilters(query, filters);

  if (typeof orderBy === "string" && orderBy.length > 0) {
    query = query.order(orderBy, { ascending });
  }

  if (limit !== null && limit > 0) {
    query = query.range(offset, offset + limit - 1);
  } else if (offset > 0) {
    query = query.range(offset, offset + 999);
  }

  const { data, error } = await query;

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
}

export async function show(req, res) {
  const { id } = req.params;
  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Image not found." });
    return;
  }

  res.json(data);
}

export async function create(req, res) {
  const payload = { ...(req.body ?? {}) };

  if (req.file?.path) {
    const publicDir = path.join(process.cwd(), "public");
    const relativePath = path.relative(publicDir, req.file.path);
    payload.path = `/${relativePath.replace(/\\/g, "/")}`;
  }

  if (!payload.path) {
    res.status(400).json({ error: "Image path is required." });
    return;
  }

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
}

export async function destroy(req, res) {
  const { id } = req.params;

  const { data, error } = await supabaseClient
    .from(TABLE_NAME)
    .delete()
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "Image not found." });
    return;
  }

  res.json(data);
}
