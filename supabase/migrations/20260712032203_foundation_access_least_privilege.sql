-- Data Foundation & Security Gate Sprint
-- Purpose: move confirmed public-facing objects toward least privilege
-- without applying the migration in this sprint.
--
-- Compatibility notes:
-- - preserves canonical Parcel Page, search, sitemap, jobs, and legacy API
--   read paths by leaving anon/authenticated SELECT on required relations.
-- - narrows public reporting and admin refresh helpers to service_role.
-- - does not touch alerts_subscribers because the linked remote schema dump
--   does not contain a verifiable backing object for that route.
--
-- Rollback procedure:
-- 1. Restore grants from the pre-apply schema dump.
-- 2. At minimum, re-grant the prior ALL privileges to anon/authenticated/
--    service_role on the objects below if the public parcel path regresses.

revoke all on table public.parcel_page_api_v2 from public;
revoke all on table public.parcel_page_api_v2 from anon;
revoke all on table public.parcel_page_api_v2 from authenticated;
revoke all on table public.parcel_page_api_v2 from service_role;
grant select on table public.parcel_page_api_v2 to anon;
grant select on table public.parcel_page_api_v2 to authenticated;
grant all on table public.parcel_page_api_v2 to service_role;

revoke all on table public.parcel_primary_project_v1 from public;
revoke all on table public.parcel_primary_project_v1 from anon;
revoke all on table public.parcel_primary_project_v1 from authenticated;
revoke all on table public.parcel_primary_project_v1 from service_role;
grant select on table public.parcel_primary_project_v1 to anon;
grant select on table public.parcel_primary_project_v1 to authenticated;
grant all on table public.parcel_primary_project_v1 to service_role;

revoke all on table public.parcel_permit_terminal_v2 from public;
revoke all on table public.parcel_permit_terminal_v2 from anon;
revoke all on table public.parcel_permit_terminal_v2 from authenticated;
revoke all on table public.parcel_permit_terminal_v2 from service_role;
grant select on table public.parcel_permit_terminal_v2 to anon;
grant select on table public.parcel_permit_terminal_v2 to authenticated;
grant all on table public.parcel_permit_terminal_v2 to service_role;

revoke all on table public.trulot_permit_parcel_link_v1 from public;
revoke all on table public.trulot_permit_parcel_link_v1 from anon;
revoke all on table public.trulot_permit_parcel_link_v1 from authenticated;
revoke all on table public.trulot_permit_parcel_link_v1 from service_role;
grant select on table public.trulot_permit_parcel_link_v1 to anon;
grant select on table public.trulot_permit_parcel_link_v1 to authenticated;
grant select on table public.trulot_permit_parcel_link_v1 to service_role;

revoke all on table public.trulot_permit_linkage_report_v1 from public;
revoke all on table public.trulot_permit_linkage_report_v1 from anon;
revoke all on table public.trulot_permit_linkage_report_v1 from authenticated;
revoke all on table public.trulot_permit_linkage_report_v1 from service_role;
grant select on table public.trulot_permit_linkage_report_v1 to service_role;

revoke all on table public.tpa_official from public;
revoke all on table public.tpa_official from anon;
revoke all on table public.tpa_official from authenticated;
revoke all on table public.tpa_official from service_role;
grant all on table public.tpa_official to service_role;

revoke all on table public.sda_official from public;
revoke all on table public.sda_official from anon;
revoke all on table public.sda_official from authenticated;
revoke all on table public.sda_official from service_role;
grant all on table public.sda_official to service_role;

revoke all on table public.ctcac_gis_v1 from public;
revoke all on table public.ctcac_gis_v1 from anon;
revoke all on table public.ctcac_gis_v1 from authenticated;
revoke all on table public.ctcac_gis_v1 from service_role;
grant all on table public.ctcac_gis_v1 to service_role;

revoke all on sequence public.tpa_official_id_seq from public;
revoke all on sequence public.tpa_official_id_seq from anon;
revoke all on sequence public.tpa_official_id_seq from authenticated;
revoke all on sequence public.tpa_official_id_seq from service_role;
grant all on sequence public.tpa_official_id_seq to service_role;

revoke all on sequence public.sda_official_id_seq from public;
revoke all on sequence public.sda_official_id_seq from anon;
revoke all on sequence public.sda_official_id_seq from authenticated;
revoke all on sequence public.sda_official_id_seq from service_role;
grant all on sequence public.sda_official_id_seq to service_role;

revoke all on sequence public.ctcac_gis_v1_id_seq from public;
revoke all on sequence public.ctcac_gis_v1_id_seq from anon;
revoke all on sequence public.ctcac_gis_v1_id_seq from authenticated;
revoke all on sequence public.ctcac_gis_v1_id_seq from service_role;
grant all on sequence public.ctcac_gis_v1_id_seq to service_role;

revoke all on function public.trulot_normalize_apn_digits(text) from public;
revoke all on function public.trulot_normalize_apn_digits(text) from anon;
revoke all on function public.trulot_normalize_apn_digits(text) from authenticated;
revoke all on function public.trulot_normalize_apn_digits(text) from service_role;
grant execute on function public.trulot_normalize_apn_digits(text) to anon;
grant execute on function public.trulot_normalize_apn_digits(text) to authenticated;
grant execute on function public.trulot_normalize_apn_digits(text) to service_role;

revoke all on function public.trulot_normalize_address_key(text) from public;
revoke all on function public.trulot_normalize_address_key(text) from anon;
revoke all on function public.trulot_normalize_address_key(text) from authenticated;
revoke all on function public.trulot_normalize_address_key(text) from service_role;
grant execute on function public.trulot_normalize_address_key(text) to anon;
grant execute on function public.trulot_normalize_address_key(text) to authenticated;
grant execute on function public.trulot_normalize_address_key(text) to service_role;

revoke all on function public.trulot_extract_apn_candidates(text) from public;
revoke all on function public.trulot_extract_apn_candidates(text) from anon;
revoke all on function public.trulot_extract_apn_candidates(text) from authenticated;
revoke all on function public.trulot_extract_apn_candidates(text) from service_role;
grant execute on function public.trulot_extract_apn_candidates(text) to anon;
grant execute on function public.trulot_extract_apn_candidates(text) to authenticated;
grant execute on function public.trulot_extract_apn_candidates(text) to service_role;

revoke all on function public.update_nearby_activity_v2() from public;
revoke all on function public.update_nearby_activity_v2() from anon;
revoke all on function public.update_nearby_activity_v2() from authenticated;
revoke all on function public.update_nearby_activity_v2() from service_role;
grant execute on function public.update_nearby_activity_v2() to service_role;

revoke all on function public.get_opportunity_feed(integer, integer, integer) from public;
revoke all on function public.get_opportunity_feed(integer, integer, integer) from anon;
revoke all on function public.get_opportunity_feed(integer, integer, integer) from authenticated;
revoke all on function public.get_opportunity_feed(integer, integer, integer) from service_role;
grant execute on function public.get_opportunity_feed(integer, integer, integer) to service_role;
