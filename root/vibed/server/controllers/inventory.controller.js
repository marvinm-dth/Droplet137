import { buildCrudController } from "./crud.controller.js";

const TABLE_NAME = "inv_inventory";
const INVENTORY_SELECT = `
  *,
  item:inv_items (
    id,
    name,
    sku_number,
    primary_image_path
  ),
  request:inv_requests (
    id,
    status,
    requested_quantity,
    quoted_quantity
  ),
  current_location:inv_locations (
    id,
    name
  )
`;

export const { index, show, create, update, destroy } = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Inventory item",
  selectClause: INVENTORY_SELECT,
});
