import { buildCrudController } from "./crud.controller.js";

const TABLE_NAME = "inv_item_groups";

export const { index, show, create, update, destroy } = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Item group",
  searchableColumns: ["name", "notes"],
});
