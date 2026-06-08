create table inv_locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  parent_id uuid,
  notes text
);

drop trigger if exists inv_locations_set_updated_at on inv_locations;
create trigger inv_locations_set_updated_at
before update on inv_locations
for each row
execute procedure set_updated_at();
