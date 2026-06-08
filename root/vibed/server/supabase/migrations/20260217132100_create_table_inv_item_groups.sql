create table inv_item_groups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  notes text,
  primary_item_id uuid
);

drop trigger if exists inv_item_groups_set_updated_at on inv_item_groups;
create trigger inv_item_groups_set_updated_at
before update on inv_item_groups
for each row
execute procedure set_updated_at();
