CREATE OR REPLACE FUNCTION check_parcel_overlays(p_lat float8, p_lng float8)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pt extensions.geometry;
  in_tpa boolean := false;
  in_sda boolean := false;
  in_ctcac boolean := false;
BEGIN
  pt := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326);

  SELECT EXISTS (
    SELECT 1 FROM tpa_official
    WHERE ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON(geojson::text), 4326), pt)
  ) INTO in_tpa;

  SELECT EXISTS (
    SELECT 1 FROM sda_official
    WHERE ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON(geojson::text), 4326), pt)
  ) INTO in_sda;

  SELECT EXISTS (
    SELECT 1 FROM ctcac_gis_v1
    WHERE ST_Contains(ST_SetSRID(ST_GeomFromGeoJSON(geojson::text), 4326), pt)
  ) INTO in_ctcac;

  RETURN jsonb_build_object(
    'tpa', in_tpa,
    'sda', in_sda,
    'ctcac', in_ctcac
  );
END;
$$;
