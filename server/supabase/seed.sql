-- Consolidated seed file for inventory reference data.
-- Runs after migrations during `supabase db reset` per config.toml.

-- insert into public.inv_suppliers (
--   id,
--   created_at,
--   updated_at,
--   name,
--   email,
--   phone,
--   address,
--   barcode,
--   notes
-- )
-- values
--   (
--     '11111111-1111-1111-1111-111111111111',
--     now(),
--     now(),
--     'Amazon',
--     'vendor@amazon.com',
--     '+1-800-555-0100',
--     '410 Terry Ave N, Seattle, WA',
--     'SUP-AMZ-001',
--     'Primary ecommerce supplier.'
--   ),
--   (
--     '22222222-2222-2222-2222-222222222222',
--     now(),
--     now(),
--     'Hardware Resources',
--     'orders@hardwareresources.com',
--     '+1-800-555-0200',
--     '3700 W Royal Ln, Irving, TX',
--     'SUP-HR-001',
--     'Primary construction and renovation supplier.'
--   ),
--   (
--     '33333333-3333-3333-3333-333333333333',
--     now(),
--     now(),
--     'PAINT',
--     null,
--     null,
--     null,
--     'SUP-PNT-001',
--     'Paint-focused supplier.'
--   ),
--   (
--     '44444444-4444-4444-4444-444444444444',
--     now(),
--     now(),
--     'Home Depot',
--     null,
--     null,
--     null,
--     'SUP-HDP-001',
--     'General home improvement supplier.'
--   )
-- on conflict (id) do update set
--   name = excluded.name,
--   email = excluded.email,
--   phone = excluded.phone,
--   address = excluded.address,
--   barcode = excluded.barcode,
--   notes = excluded.notes,
--   updated_at = now();

-- insert into public.inv_locations (
--   id,
--   created_at,
--   updated_at,
--   name,
--   parent_id,
--   notes
-- )
-- values
--   (
--     'c0000000-0000-0000-0000-000000000001',
--     now(),
--     now(),
--     'Warehouse A - Main Floor',
--     null,
--     'Primary bulk storage for daily fulfillment.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000002',
--     now(),
--     now(),
--     'Aisle A1 - Fasteners',
--     'c0000000-0000-0000-0000-000000000001',
--     'Anchor bolts and framing screws.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000003',
--     now(),
--     now(),
--     'Bin A1-01',
--     'c0000000-0000-0000-0000-000000000002',
--     'Concrete anchors.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000004',
--     now(),
--     now(),
--     'Bin A1-02',
--     'c0000000-0000-0000-0000-000000000002',
--     'Wood and framing screws.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000005',
--     now(),
--     now(),
--     'Aisle A2 - Power Tools',
--     'c0000000-0000-0000-0000-000000000001',
--     'Power tool shelves and overflow.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000006',
--     now(),
--     now(),
--     'Warehouse B - Receiving Dock',
--     null,
--     'Staging zone for inbound delivery check-in.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000007',
--     now(),
--     now(),
--     'Dock Lane 1',
--     'c0000000-0000-0000-0000-000000000006',
--     'Priority unload lane.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000008',
--     now(),
--     now(),
--     'Dock Lane 2',
--     'c0000000-0000-0000-0000-000000000006',
--     'Standard unload lane.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000009',
--     now(),
--     now(),
--     'Warehouse C - Secure Cage',
--     null,
--     'Controlled access for high-value tools.'
--   ),
--   (
--     'c0000000-0000-0000-0000-000000000010',
--     now(),
--     now(),
--     'Cage Row 1',
--     'c0000000-0000-0000-0000-000000000009',
--     'Primary secure cage row.'
--   )
-- on conflict (id) do update set
--   name = excluded.name,
--   parent_id = excluded.parent_id,
--   notes = excluded.notes,
--   updated_at = now();

-- insert into public.inv_item_groups (
--   id,
--   created_at,
--   updated_at,
--   name,
--   notes
-- )
-- values
--   (
--     '90000000-0000-0000-0000-000000000001',
--     now(),
--     now(),
--     'Power Tools',
--     'Core drill and hammer tools.'
--   ),
--   (
--     '90000000-0000-0000-0000-000000000002',
--     now(),
--     now(),
--     'Measuring and Detection',
--     'Meters and stud detection tools.'
--   ),
--   (
--     '90000000-0000-0000-0000-000000000003',
--     now(),
--     now(),
--     'Plumbing and Tile',
--     'Plumbing install tools and tile equipment.'
--   ),
--   (
--     '90000000-0000-0000-0000-000000000004',
--     now(),
--     now(),
--     'Framing and Cutting',
--     'Drywall fastening and cutting tools.'
--   ),
--   (
--     '90000000-0000-0000-0000-000000000005',
--     now(),
--     now(),
--     'Access and Demolition',
--     'Ladders and demolition hand tools.'
--   )
-- on conflict (id) do update set
--   name = excluded.name,
--   notes = excluded.notes,
--   updated_at = now();

insert into "inv_user" (
  "id",
  "name",
  "email",
  "emailVerified",
  "image",
  "createdAt",
  "updatedAt",
  "role"
)
values (
  'RAb0aaYfH32tKR2FGCa0VYBaDecQ1z22',
  'John Admin',
  'admin@email.com',
  false,
  null,
  '2026-02-17 05:39:49.998+00',
  '2026-02-17 05:39:49.998+00',
  'admin'
)
on conflict ("id") do update set
  "name" = excluded."name",
  "email" = excluded."email",
  "emailVerified" = excluded."emailVerified",
  "image" = excluded."image",
  "updatedAt" = excluded."updatedAt";

insert into "inv_account" (
  "id",
  "accountId",
  "providerId",
  "userId",
  "accessToken",
  "refreshToken",
  "idToken",
  "accessTokenExpiresAt",
  "refreshTokenExpiresAt",
  "scope",
  "password",
  "createdAt",
  "updatedAt"
)
values (
  'MLX7B7k6oxGPy7YpC0PGuhlwHY91Vtef',
  'RAb0aaYfH32tKR2FGCa0VYBaDecQ1z22',
  'credential',
  'RAb0aaYfH32tKR2FGCa0VYBaDecQ1z22',
  null,
  null,
  null,
  null,
  null,
  null,
  '3ba3bc36e33c709d776cd2ddacb372c4:6832419b5d2e9699e8015a5b6f300694dbbf0aa89b4b7fc59c5506e2192fe32436736a3af7eedcd07fa0d690c122e847644592243142498ba33283c0d51b2eda',
  '2026-02-17 05:39:50.009+00',
  '2026-02-17 05:39:50.009+00'
)
on conflict ("id") do update set
  "accountId" = excluded."accountId",
  "providerId" = excluded."providerId",
  "userId" = excluded."userId",
  "accessToken" = excluded."accessToken",
  "refreshToken" = excluded."refreshToken",
  "idToken" = excluded."idToken",
  "accessTokenExpiresAt" = excluded."accessTokenExpiresAt",
  "refreshTokenExpiresAt" = excluded."refreshTokenExpiresAt",
  "scope" = excluded."scope",
  "password" = excluded."password",
  "updatedAt" = excluded."updatedAt";
