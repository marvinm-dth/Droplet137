-- Pre-clean known app objects to avoid name conflicts when replaying migrations.
-- Only drops app tables and enum types if they already exist.

-- Better Auth tables
drop table if exists public."inv_account" cascade;
drop table if exists public."inv_session" cascade;
drop table if exists public."inv_verification" cascade;
drop table if exists public."inv_user" cascade;

-- Inventory app tables
drop table if exists public.inv_images cascade;
drop table if exists public.inv_inventory cascade;
drop table if exists public.inv_delivery_items cascade;
drop table if exists public.inv_deliveries cascade;
drop table if exists public.inv_orders cascade;
drop table if exists public.inv_requests cascade;
drop table if exists public.inv_item_groups cascade;
drop table if exists public.inv_locations cascade;
drop table if exists public.inv_suppliers cascade;
drop table if exists public.inv_items cascade;

-- Enum types
drop type if exists public.inv_inventory_status cascade;
drop type if exists public.inv_delivery_status cascade;
drop type if exists public.inv_request_status cascade;
drop type if exists public.inv_request_type cascade;
drop type if exists public.inv_item_status cascade;
drop type if exists public.inv_user_role cascade;
drop type if exists public.inv_order_status cascade;
