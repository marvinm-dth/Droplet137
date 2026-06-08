
create table public.inv_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  uploader_id text,
  
  imageable_entity text,
  imageable_id uuid,
  path text NOT NULL UNIQUE
);

drop trigger if exists inv_images_set_updated_at on public.inv_images;
create trigger inv_images_set_updated_at
before update on public.inv_images
for each row
execute procedure set_updated_at();
