-- Location hierarchy
alter table public.inv_locations
  add constraint inv_locations_parent_id_fkey
    foreign key (parent_id)
    references public.inv_locations(id)
    on delete set null;

-- Item group relationships
alter table public.inv_item_groups
  add constraint inv_item_groups_primary_item_id_fkey
    foreign key (primary_item_id)
    references public.inv_items(id)
    on delete set null;

-- Item relationships
alter table public.inv_items
  add constraint inv_items_group_id_fkey
    foreign key (group_id)
    references public.inv_item_groups(id)
    on delete set null,
  add constraint inv_items_supplier_id_fkey
    foreign key (supplier_id)
    references public.inv_suppliers(id)
    on delete set null,
  add constraint inv_items_creator_id_fkey
    foreign key (creator_id)
    references public."inv_user"(id)
    on delete set null,
  add constraint inv_items_default_location_id_fkey
    foreign key (default_location_id)
    references public.inv_locations(id)
    on delete set null,
  add constraint inv_items_primary_image_path_fkey
    foreign key (primary_image_path)
    references public.inv_images(path)
    on delete set null;

-- Order relationships
alter table public.inv_orders
  add constraint inv_orders_orderer_id_fkey
    foreign key (orderer_id)
    references public."inv_user"(id)
    on delete set null,
  add constraint inv_orders_supplier_id_fkey
    foreign key (supplier_id)
    references public.inv_suppliers(id)
    on delete set null;

-- Delivery relationships
alter table public.inv_deliveries
  add constraint inv_deliveries_creator_id_fkey
    foreign key (creator_id)
    references public."inv_user"(id)
    on delete set null,
  add constraint inv_deliveries_order_id_fkey
    foreign key (order_id)
    references public.inv_orders(id)
    on delete set null,
  add constraint inv_deliveries_supplier_id_fkey
    foreign key (supplier_id)
    references public.inv_suppliers(id)
    on delete set null;

-- Request relationships
alter table public.inv_requests
  add constraint inv_requests_order_id_fkey
    foreign key (order_id)
    references public.inv_orders(id)
    on delete set null,
  add constraint inv_requests_supplier_id_fkey
    foreign key (supplier_id)
    references public.inv_suppliers(id)
    on delete set null,
  add constraint inv_requests_item_id_fkey
    foreign key (item_id)
    references public.inv_items(id),
  add constraint inv_requests_evaluator_id_fkey
    foreign key (evaluator_id)
    references public."inv_user"(id)
    on delete set null,
  add constraint inv_requests_requester_id_fkey
    foreign key (requester_id)
    references public."inv_user"(id)
    on delete set null;

-- Delivery item relationships
alter table public.inv_delivery_items
  add constraint inv_delivery_items_delivery_id_fkey
    foreign key (delivery_id)
    references public.inv_deliveries(id)
    on delete set null,
  add constraint inv_delivery_items_request_id_fkey
    foreign key (request_id)
    references public.inv_requests(id)
    on delete set null,
  add constraint inv_delivery_items_item_id_fkey
    foreign key (item_id)
    references public.inv_items(id);

-- Inventory relationships
alter table public.inv_inventory
  add constraint inv_inventory_item_id_fkey
    foreign key (item_id)
    references public.inv_items(id)
    on delete set null,
  add constraint inv_inventory_request_id_fkey
    foreign key (request_id)
    references public.inv_requests(id)
    on delete set null,
  add constraint inv_inventory_delivery_item_id_fkey
    foreign key (delivery_item_id)
    references public.inv_delivery_items(id)
    on delete set null,
  add constraint inv_inventory_supplier_id_fkey
    foreign key (supplier_id)
    references public.inv_suppliers(id)
    on delete set null,
  add constraint inv_inventory_current_location_id_fkey
    foreign key (current_location_id)
    references public.inv_locations(id)
    on delete set null;
