import { buildCrudController } from "./crud.controller.js";
import { supabaseClient } from "../libs/supabaseClient.js";

const TABLE_NAME = "inv_delivery_items";
const DELIVERY_ITEM_SELECT = `
  *,
  item:inv_items (
    id,
    name,
    sku_number
  ),
  inventory:inv_inventory (
    id,
    is_received
  ),
  request:inv_requests (
    id,
    status,
    requested_quantity
  )
`;

export const { index, show, create, update, destroy } = buildCrudController({
  tableName: TABLE_NAME,
  entityName: "Delivery item",
  selectClause: DELIVERY_ITEM_SELECT,
  searchableColumns: ["notes"],
});

const PRINT_LABELS_DELIVERY_ITEM_SELECT = `
  id,
  item_id,
  request_id,
  delivery:inv_deliveries (
    id,
    supplier_id
  ),
  item:inv_items (
    id,
    name,
    sku_number,
    status,
    price,
    primary_image_path,
    default_location_id,
    supplier:inv_suppliers (
      id,
      name
    )
  ),
  request:inv_requests (
    id,
    item_snapshot
  )
`;

export async function printLabels(req, res) {
  const { id } = req.params;
  const rawCount = Number(req.body?.count);
  const count = Number.isInteger(rawCount) ? rawCount : 0;

  if (count <= 0) {
    res.status(400).json({ error: "count must be a positive integer." });
    return;
  }

  const { data: deliveryItem, error: deliveryItemError } = await supabaseClient
    .from(TABLE_NAME)
    .select(PRINT_LABELS_DELIVERY_ITEM_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (deliveryItemError) {
    res.status(500).json({ error: deliveryItemError.message });
    return;
  }

  if (!deliveryItem) {
    res.status(404).json({ error: "Delivery item not found." });
    return;
  }

  if (!deliveryItem.item_id) {
    res.status(400).json({ error: "Delivery item has no item_id." });
    return;
  }

  const item = deliveryItem.item ?? null;
  const request = deliveryItem.request ?? null;
  const delivery = deliveryItem.delivery ?? null;
  const itemSnapshot = request?.item_snapshot ?? {
    item_id: item?.id ?? deliveryItem.item_id,
    item_name: item?.name ?? "Unnamed Item",
    supplier_name: item?.supplier?.name ?? null,
    sku_number: item?.sku_number ?? null,
    status: item?.status ?? null,
    price: item?.price ?? null,
    image_url: item?.primary_image_path ?? null,
  };

  const rowsToInsert = Array.from({ length: count }, () => ({
    item_id: deliveryItem.item_id,
    request_id: deliveryItem.request_id ?? null,
    delivery_item_id: deliveryItem.id,
    current_location_id: item?.default_location_id ?? null,
    supplier_id: delivery?.supplier_id ?? item?.supplier?.id ?? null,
    item_snapshot: itemSnapshot,
    status: "available",
    is_received: false,
  }));

  const { data: createdRows, error: createError } = await supabaseClient
    .from("inv_inventory")
    .insert(rowsToInsert)
    .select("id");

  if (createError) {
    res.status(400).json({ error: createError.message });
    return;
  }

  res.status(201).json({
    data: createdRows ?? [],
    created_count: (createdRows ?? []).length,
    delivery_item_id: deliveryItem.id,
  });
}
