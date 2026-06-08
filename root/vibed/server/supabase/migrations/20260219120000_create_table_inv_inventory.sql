CREATE type inv_inventory_status AS ENUM ('available', 'used', 'missing');

create table public.inv_inventory (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    item_id uuid,
    request_id uuid,
    delivery_item_id uuid,
    current_location_id uuid,
    supplier_id uuid,

    item_snapshot jsonb,
    status inv_inventory_status default 'available',
    status_notes text,

    is_received boolean default false
);

drop trigger if exists inv_inventory_set_updated_at on public.inv_inventory;
create trigger inv_inventory_set_updated_at
before update on public.inv_inventory
for each row
execute procedure set_updated_at();