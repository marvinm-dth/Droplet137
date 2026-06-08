create table public.inv_delivery_items (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    delivery_id uuid,
    request_id uuid,
    item_id uuid,

    expected_items integer check (expected_items >= 0),
    received_items integer default 0 check (received_items >= 0),
    missing_items integer
        generated always as (expected_items - received_items) stored,

    notes text
);

drop trigger if exists inv_delivery_items_set_updated_at on public.inv_delivery_items;
create trigger inv_delivery_items_set_updated_at
before update on public.inv_delivery_items
for each row
execute procedure set_updated_at();
