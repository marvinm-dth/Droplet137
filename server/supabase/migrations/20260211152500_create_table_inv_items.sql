create type inv_item_status as enum (
  'available',
  'discontinued',
  'out_of_stock',
  'on_back_order'
);

create table inv_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  creator_id text,
  supplier_id uuid,
  default_location_id uuid,
  group_id uuid,

  primary_image_path text,
  group_weight numeric check (group_weight >= 0),

  sku_number text,
  internet_sku_number text,
  internal_sku text,
  dth_sku text,
  material_id text,
  upc text[],

  description text,
  description_mandarin text,
  name text,
  name_mandarin text,
  brand text,
  brand_mandarin text,
  department text,
  department_mandarin text,
  details text,
  details_mandarin text,
  notes text,
  notes_mandarin text,

  template text,

  status inv_item_status default 'available',
  price numeric(12, 2) check (price >= 0),
  default_order_quantity integer check (default_order_quantity >= 0),
  pack_size integer check (pack_size >= 0),

  label_size text,

  reorder_point integer check (reorder_point >= 0),
  is_reorder boolean default false,
  keywords text[],
  keywords_mandarin text[],

  is_archived boolean
);


drop trigger if exists inv_items_set_updated_at on inv_items;
create trigger inv_items_set_updated_at
before update on inv_items
for each row
execute procedure set_updated_at();
