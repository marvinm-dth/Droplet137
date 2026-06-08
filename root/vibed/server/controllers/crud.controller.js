import { supabaseClient } from "../libs/supabaseClient.js";

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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
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

export function buildCrudController({
  tableName,
  entityName,
  selectClause = "*",
  searchableColumns = [],
  defaultPageSize = 10,
}) {
  const missingLabel = `${entityName} not found.`;

  async function index(req, res) {
    const filters = parseFilterObject(req.query.filters ?? req.body?.filters);
    const allRecords = toBoolean(req.query.all);
    const searchQuery =
      typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limitParam = toNumber(req.query.limit);
    const offsetParam = toNumber(req.query.offset);
    const pageParam = toNumber(req.query.page);
    const pageSizeParam = toNumber(req.query.pageSize);
    const orderBy = req.query.sort_by ?? req.query.orderBy;
    const sortDir =
      req.query.sort_dir ?? (req.query.ascending !== "false" ? "asc" : "desc");
    const ascending = sortDir !== "desc";
    const hasPage = pageParam !== null && pageParam > 0;
    const pageSize =
      pageSizeParam !== null && pageSizeParam > 0
        ? pageSizeParam
        : limitParam !== null && limitParam > 0
          ? limitParam
          : defaultPageSize;
    const page = hasPage ? pageParam : Math.floor((offsetParam ?? 0) / pageSize) + 1;
    const offset = hasPage ? (page - 1) * pageSize : offsetParam ?? 0;
    const rangeTo = offset + pageSize - 1;

    let query = supabaseClient
      .from(tableName)
      .select(selectClause, { count: "exact" });

    query = applyFilters(query, filters);

    if (searchQuery.length > 0 && searchableColumns.length > 0) {
      const escapedSearch = searchQuery.replace(/,/g, "\\,");
      query = query.or(
        searchableColumns
          .map((column) => `${column}.ilike.%${escapedSearch}%`)
          .join(","),
      );
    }

    if (typeof orderBy === "string" && orderBy.length > 0) {
      query = query.order(orderBy, { ascending });
    }

    if (!allRecords) {
      query = query.range(offset, rangeTo);
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const safeTotalFilteredItems = count ?? 0;
    const allPageSize = data?.length ?? safeTotalFilteredItems;
    const resolvedPageSize = allRecords ? allPageSize : pageSize;
    const totalPages = allRecords
      ? safeTotalFilteredItems > 0
        ? 1
        : 0
      : safeTotalFilteredItems > 0
        ? Math.ceil(safeTotalFilteredItems / pageSize)
        : 0;
    const resolvedPage = allRecords ? 1 : page;

    res.json({
      data: data ?? [],
      pagination: {
        page: resolvedPage,
        pageSize: resolvedPageSize,
        totalItems: safeTotalFilteredItems,
        totalFilteredItems: safeTotalFilteredItems,
        totalPages,
        hasNextPage: allRecords ? false : page < totalPages,
        hasPreviousPage: allRecords ? false : page > 1,
      },
    });
  }

  async function show(req, res) {
    const { id } = req.params;
    const { data, error } = await supabaseClient
      .from(tableName)
      .select(selectClause)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: missingLabel });
      return;
    }

    res.json(data);
  }

  async function create(req, res) {
    const payload = req.body;

    const { data, error } = await supabaseClient
      .from(tableName)
      .insert(payload)
      .select(selectClause)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(201).json(data);
  }

  async function update(req, res) {
    const { id } = req.params;
    const payload = req.body;

    const { data, error } = await supabaseClient
      .from(tableName)
      .update(payload)
      .eq("id", id)
      .select(selectClause)
      .maybeSingle();

    if (error) {
      res.status(400).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: missingLabel });
      return;
    }

    res.json(data);
  }

  async function destroy(req, res) {
    const { id } = req.params;

    const { data, error } = await supabaseClient
      .from(tableName)
      .delete()
      .eq("id", id)
      .select(selectClause)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ error: missingLabel });
      return;
    }

    res.json(data);
  }

  return {
    index,
    show,
    create,
    update,
    destroy,
  };
}

