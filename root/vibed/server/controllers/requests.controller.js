import { buildCrudController } from "./crud.controller.js";

const TABLE_NAME = "inv_requests";
const REQUEST_SELECT = `
  *,
  supplier:inv_suppliers (
    id,
    name
  ),
  evaluator:inv_user!evaluator_id (
    id,
    name
  ),
  item:inv_items (
    id,
    name,
    sku_number,
    primary_image_path
  ),
  order:inv_orders (
    id,
    name,
    status
  )
`;

export const { index, show, create, update, destroy } = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Request",
  selectClause: REQUEST_SELECT,
  searchableColumns: ["status_notes", "requester_id", "evaluator_id", "status", "type"],
});
