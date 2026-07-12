insert into public.parcel_page_api_v2 (
  apn_norm,
  address,
  city,
  state,
  zone_name,
  zone_family,
  base_zone,
  lot_area_sqft,
  nearby_active_count,
  has_nearby_active_project,
  slug,
  status_label,
  generated_at,
  geom,
  situs_zip,
  lat,
  lng
) values
  (
    '1234567890',
    '123 Main St',
    'San Diego',
    'CA',
    'RS-1-7',
    'RS',
    'RS-1-7',
    7000,
    0,
    false,
    '1234567890-123-main-st',
    'No recent activity',
    '2026-07-11T00:00:00Z',
    extensions.st_setsrid(extensions.st_makepoint(-117.19, 32.75), 4326),
    '92101',
    32.75,
    -117.19
  ),
  (
    '1234567891',
    '125 Main St',
    'San Diego',
    'CA',
    'RS-1-7',
    'RS',
    'RS-1-7',
    7200,
    0,
    false,
    '1234567891-125-main-st',
    'No recent activity',
    '2026-07-11T00:00:00Z',
    extensions.st_setsrid(extensions.st_makepoint(-117.1905, 32.7505), 4326),
    '92101',
    32.7505,
    -117.1905
  );

insert into public.parcel_primary_project_v1 (apn_norm, primary_project_tier, has_building_project, project_momentum_label)
values
  ('1234567891', 1, true, 'Active');

insert into public.parcel_permit_terminal_v2 (
  apn_norm,
  record_id,
  record_number,
  record_type,
  status,
  normalized_stage,
  opened_date,
  last_activity_date,
  stale_flag,
  hierarchy_role,
  address_full,
  description,
  permit_source,
  project_id,
  job_id,
  approval_scope,
  project_scope,
  project_title
) values
  (
    '1234567890',
    'RID-1',
    'PRJ-1',
    'Building Permit',
    'Issued',
    'ISSUED',
    '2026-01-15',
    '2026-02-01',
    false,
    'building',
    '123 Main St, San Diego, CA',
    'New detached ADU at APN 123-456-78-90',
    'city',
    'P1',
    'J1',
    'ADU',
    'ADU',
    'Detached ADU'
  ),
  (
    '',
    'RID-2',
    'PRJ-2',
    'Review',
    'Applied',
    'REVIEW',
    '2026-03-10',
    '2026-03-11',
    false,
    'planning',
    '123 Main St, San Diego, CA',
    'Address-only permit context',
    'city',
    'P2',
    'J2',
    'Review',
    'Review',
    'Address-only permit'
  );

insert into public.tpa_official (geojson, properties, source_layer, geom)
values (
  '{"type":"Polygon","coordinates":[[[-117.20,32.74],[-117.18,32.74],[-117.18,32.76],[-117.20,32.76],[-117.20,32.74]]]}'::jsonb,
  '{}'::jsonb,
  'tpa',
  extensions.st_setsrid(
    extensions.st_geomfromgeojson('{"type":"Polygon","coordinates":[[[-117.20,32.74],[-117.18,32.74],[-117.18,32.76],[-117.20,32.76],[-117.20,32.74]]]}'),
    4326
  )
);

insert into public.sda_official (geojson, properties, source_layer, geom)
values (
  '{"type":"Polygon","coordinates":[[[-117.20,32.74],[-117.18,32.74],[-117.18,32.76],[-117.20,32.76],[-117.20,32.74]]]}'::jsonb,
  '{}'::jsonb,
  'sda',
  extensions.st_setsrid(
    extensions.st_geomfromgeojson('{"type":"Polygon","coordinates":[[[-117.20,32.74],[-117.18,32.74],[-117.18,32.76],[-117.20,32.76],[-117.20,32.74]]]}'),
    4326
  )
);

insert into public.ctcac_gis_v1 (geojson, properties, source_layer, geom)
values (
  '{"type":"Polygon","coordinates":[[[-117.20,32.74],[-117.18,32.74],[-117.18,32.76],[-117.20,32.76],[-117.20,32.74]]]}'::jsonb,
  '{}'::jsonb,
  'ctcac',
  extensions.st_setsrid(
    extensions.st_geomfromgeojson('{"type":"Polygon","coordinates":[[[-117.20,32.74],[-117.18,32.74],[-117.18,32.76],[-117.20,32.76],[-117.20,32.74]]]}'),
    4326
  )
);
