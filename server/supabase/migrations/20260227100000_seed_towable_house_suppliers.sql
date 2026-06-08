insert into public.inv_suppliers (
  id,
  created_at,
  updated_at,
  name,
  email,
  phone,
  address,
  barcode,
  notes,
  is_archived
)
values
  ('a1000000-0000-4000-8000-000000000001', now(), now(), 'ChassisWorks Steel', 'sales@chassisworks.example', '+1-555-200-0101', 'Fort Worth, TX', 'SUP-TH-001', 'Galvanized trailer chassis and axle mounts.', false),
  ('a1000000-0000-4000-8000-000000000002', now(), now(), 'RoadSafe Axles', 'orders@roadsafe.example', '+1-555-200-0102', 'Tulsa, OK', 'SUP-TH-002', 'Torsion axles, hubs, and wheel assemblies.', false),
  ('a1000000-0000-4000-8000-000000000003', now(), now(), 'FrameFasteners Pro', 'quotes@framefasteners.example', '+1-555-200-0103', 'Kansas City, MO', 'SUP-TH-003', 'Structural screws, bolts, and anchors.', false),
  ('a1000000-0000-4000-8000-000000000004', now(), now(), 'InsulCore Systems', 'team@insulcore.example', '+1-555-200-0104', 'Boise, ID', 'SUP-TH-004', 'Rigid foam and spray insulation products.', false),
  ('a1000000-0000-4000-8000-000000000005', now(), now(), 'PlyCraft Panels', 'sales@plycraft.example', '+1-555-200-0105', 'Birmingham, AL', 'SUP-TH-005', 'Marine plywood, wall panels, and sheathing.', false),
  ('a1000000-0000-4000-8000-000000000006', now(), now(), 'EcoVolt Power', 'account@ecovolt.example', '+1-555-200-0106', 'Phoenix, AZ', 'SUP-TH-006', 'Solar kits, inverters, and battery systems.', false),
  ('a1000000-0000-4000-8000-000000000007', now(), now(), 'FlowLine Plumbing', 'purchasing@flowline.example', '+1-555-200-0107', 'Nashville, TN', 'SUP-TH-007', 'PEX lines, pumps, valves, and fixtures.', false),
  ('a1000000-0000-4000-8000-000000000008', now(), now(), 'BrightWire Electrical', 'orders@brightwire.example', '+1-555-200-0108', 'Raleigh, NC', 'SUP-TH-008', 'Breakers, wiring, outlets, and control boxes.', false),
  ('a1000000-0000-4000-8000-000000000009', now(), now(), 'TrailSeal Exterior', 'support@trailseal.example', '+1-555-200-0109', 'Orlando, FL', 'SUP-TH-009', 'Weatherproofing membranes, sealants, and trims.', false),
  ('a1000000-0000-4000-8000-000000000010', now(), now(), 'CabinComfort Interiors', 'hello@cabincomfort.example', '+1-555-200-0110', 'Grand Rapids, MI', 'SUP-TH-010', 'Cabinet hardware, flooring, and finish materials.', false)
on conflict (id) do update set
  name = excluded.name,
  email = excluded.email,
  phone = excluded.phone,
  address = excluded.address,
  barcode = excluded.barcode,
  notes = excluded.notes,
  is_archived = excluded.is_archived,
  updated_at = now();
