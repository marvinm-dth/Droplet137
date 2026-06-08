create type inv_delivery_status as enum ('in_transit', 'received_complete', 'received_missing');

create table public.inv_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    creator_id text, -- fk
    
    order_id uuid, -- fk
    supplier_id uuid, -- fk
    
    name text,
    notes text,
    arrived_at timestamptz,
    
    status inv_delivery_status default 'in_transit',
    status_notes text,

    is_archived boolean,
    is_cancelled boolean,
    cancel_reason text
);

drop trigger if exists inv_deliveries_set_updated_at on public.inv_deliveries;
create trigger inv_deliveries_set_updated_at
before update on public.inv_deliveries
for each row
execute procedure set_updated_at();
