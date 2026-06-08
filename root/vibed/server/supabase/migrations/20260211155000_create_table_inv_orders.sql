CREATE type inv_order_status AS ENUM ('draft', 'awaiting_quote', 'awaiting_delivery', 'fulfilled_complete', 'fulfilled_missing');

create table public.inv_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    orderer_id text, -- fk
    supplier_id uuid, -- fk

    supplier_tracking_id text,

    name text,
    notes text,
    status inv_order_status default 'draft',
    status_notes text,

    is_archived boolean,
    is_cancelled boolean,
    cancel_reason text
);

drop trigger if exists inv_orders_set_updated_at on public.inv_orders;
create trigger inv_orders_set_updated_at
before update on public.inv_orders
for each row
execute procedure set_updated_at();
