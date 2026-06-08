create table inv_suppliers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  creator_id text,

  name text not null,
  email text,
  phone text,
  address text,
  barcode text,
  notes text,
  is_archived boolean
);


drop trigger if exists inv_suppliers_set_updated_at on inv_suppliers;
create trigger inv_suppliers_set_updated_at
before update on inv_suppliers
for each row
execute procedure set_updated_at();
