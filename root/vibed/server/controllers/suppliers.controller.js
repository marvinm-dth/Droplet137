import { buildCrudController } from "./crud.controller.js";

const TABLE_NAME = "inv_suppliers";
const SUPPLIER_SELECT = `
  *,
  items:inv_items (
    count
  ),
  requests:inv_requests (
    count
  )
`;

const suppliersCrudController = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Supplier",
  selectClause: SUPPLIER_SELECT,
  searchableColumns: ["name", "email", "phone", "address", "barcode", "notes"],
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
  if (typeof rawFilters === "object") return rawFilters;
  return {};
}

export async function index(req, res) {
  const requestsStatus =
    typeof req.query.requests_status === "string"
      ? req.query.requests_status.trim()
      : "";

  if (requestsStatus.length > 0) {
    const nextFilters = parseFilters(req.query.filters);
    nextFilters["requests.status"] = requestsStatus;
    req.query.filters = JSON.stringify(nextFilters);
  }

  return suppliersCrudController.index(req, res);
}

export const { show, create, update, destroy } = suppliersCrudController;
