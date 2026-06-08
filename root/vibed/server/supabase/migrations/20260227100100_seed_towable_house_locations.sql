insert into public.inv_locations (
  id,
  created_at,
  updated_at,
  name,
  parent_id,
  notes
)
values
  ('b1000000-0000-4000-8000-000000000001', now(), now(), 'Towable House Campus', null, 'Root location for all production and storage zones.'),

  ('b1000000-0000-4000-8000-000000000002', now(), now(), 'Zone A - Chassis Fabrication', 'b1000000-0000-4000-8000-000000000001', 'Steel frame and trailer base assembly.'),
  ('b1000000-0000-4000-8000-000000000003', now(), now(), 'Zone B - Shell Assembly', 'b1000000-0000-4000-8000-000000000001', 'Wall, roof, and insulation staging.'),
  ('b1000000-0000-4000-8000-000000000004', now(), now(), 'Zone C - MEP Install', 'b1000000-0000-4000-8000-000000000001', 'Mechanical, electrical, and plumbing install.'),
  ('b1000000-0000-4000-8000-000000000005', now(), now(), 'Zone D - Interior Finish', 'b1000000-0000-4000-8000-000000000001', 'Cabinet, flooring, and final fit-out.'),

  ('b1000000-0000-4000-8000-000000000006', now(), now(), 'A1 - Chassis Steel Rack', 'b1000000-0000-4000-8000-000000000002', 'Raw steel beams and cross-member stock.'),
  ('b1000000-0000-4000-8000-000000000007', now(), now(), 'A2 - Axle and Wheel Bay', 'b1000000-0000-4000-8000-000000000002', 'Axles, hubs, wheels, and towing couplers.'),
  ('b1000000-0000-4000-8000-000000000008', now(), now(), 'B1 - Framing Lumber Aisle', 'b1000000-0000-4000-8000-000000000003', 'Wall studs and roof framing components.'),
  ('b1000000-0000-4000-8000-000000000009', now(), now(), 'B2 - Insulation and Panel Bay', 'b1000000-0000-4000-8000-000000000003', 'Insulation rolls, rigid board, and sheathing.'),
  ('b1000000-0000-4000-8000-000000000010', now(), now(), 'C1 - Electrical Cage', 'b1000000-0000-4000-8000-000000000004', 'Wiring, breakers, and inverter equipment.'),
  ('b1000000-0000-4000-8000-000000000011', now(), now(), 'C2 - Plumbing Cage', 'b1000000-0000-4000-8000-000000000004', 'PEX lines, fittings, pumps, and water heaters.'),
  ('b1000000-0000-4000-8000-000000000012', now(), now(), 'D1 - Cabinet and Hardware Wall', 'b1000000-0000-4000-8000-000000000005', 'Cabinets, hinges, sliders, and mounts.'),
  ('b1000000-0000-4000-8000-000000000013', now(), now(), 'D2 - Flooring and Finish Bay', 'b1000000-0000-4000-8000-000000000005', 'Floor planks, trim kits, and adhesives.')
on conflict (id) do update set
  name = excluded.name,
  parent_id = excluded.parent_id,
  notes = excluded.notes,
  updated_at = now();
