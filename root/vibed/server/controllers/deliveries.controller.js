import { buildCrudController } from "./crud.controller.js";

const TABLE_NAME = "inv_deliveries";
const DELIVERY_SELECT = `
  *,
  supplier:inv_suppliers (
    id,
    name
  ),
  order:inv_orders (
    id,
    name,
    status
  )
`;

export const { index, show, create, update, destroy } = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Delivery",
  selectClause: DELIVERY_SELECT,
  searchableColumns: ["name", "notes", "status_notes"],
});
