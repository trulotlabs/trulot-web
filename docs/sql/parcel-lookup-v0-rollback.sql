-- Packet 45 rollback. Run only after disabling TRULOT_PARCEL_LOOKUP_V0.
-- This removes lookup-only objects and never changes Parcel Base V2, Parcel V1,
-- zoning, snapshots, or serving views.

begin;

drop function if exists public.parcel_lookup_v0_search(text, text, integer);
drop function if exists trulot_v2.build_parcel_lookup_v0();
drop table if exists trulot_v2.parcel_lookup_v0;
drop function if exists trulot_v2.parcel_lookup_normalize_address_v0(text);

commit;
