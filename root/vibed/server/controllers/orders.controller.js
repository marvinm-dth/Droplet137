import { buildCrudController } from "./crud.controller.js";

const TABLE_NAME = "inv_orders";
const ORDER_SELECT = `
  *,
  orderer:inv_user!inv_orders_orderer_id_fkey (
    id,
    name,
    image
  ),
  supplier:inv_suppliers (
    id,
    name,
    phone
  )
`;

export const { index, show, create, update, destroy } = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Order",
  selectClause: ORDER_SELECT,
  searchableColumns: [
    "name",
    "notes",
    "supplier_tracking_id",
    "status_notes",
    "orderer_id",
    "status",
  ],
});
