create type inv_request_status as enum ('pending', 'processed', 'denied');
create type inv_request_type as enum ('automatic', 'manual_worker', 'manual_admin');


create table public.inv_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    order_id uuid, -- fk
    supplier_id uuid, -- fk
    item_id uuid, -- fk
    evaluator_id text, -- fk
    requester_id text, -- fk

    type inv_request_type default 'manual_worker',
  
    requested_price numeric(12, 2) check (requested_price >= 0),
    requested_quantity integer check (requested_quantity > 0),

    quoted_price numeric(12, 2) check (quoted_price >= 0),
    quoted_quantity integer check (quoted_quantity >= 0),

    status inv_request_status default 'pending',
    status_notes text,

    item_snapshot jsonb,

    is_archived boolean,
    is_cancelled boolean,
    cancel_reason text
);

drop trigger if exists inv_requests_set_updated_at on public.inv_requests;
create trigger inv_requests_set_updated_at
before update on public.inv_requests
for each row
execute procedure set_updated_at();
