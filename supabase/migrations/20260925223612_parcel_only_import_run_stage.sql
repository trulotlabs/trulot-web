-- Decouple the parcel acquisition stage from integrated parcel/zoning selection.
-- Existing runs predate staged loading and are therefore integrated runs.

alter table trulot_v2.import_run
  add column run_kind text not null default 'INTEGRATED';

alter table trulot_v2.import_run
  alter column zoning_acquisition_id drop not null,
  add constraint import_run_kind_check
    check (run_kind in ('PARCEL_ONLY', 'INTEGRATED')),
  add constraint import_run_stage_acquisition_check
    check (
      (run_kind = 'PARCEL_ONLY' and zoning_acquisition_id is null)
      or
      (run_kind = 'INTEGRATED' and zoning_acquisition_id is not null)
    ),
  add constraint import_run_selection_identity_key
    unique (import_run_id, run_kind, parcel_acquisition_id, zoning_acquisition_id);

alter table trulot_v2.selected_snapshot
  add column import_run_kind text not null default 'INTEGRATED'
    check (import_run_kind = 'INTEGRATED');

alter table trulot_v2.selected_snapshot
  drop constraint selected_snapshot_import_run_id_fkey,
  add constraint selected_snapshot_integrated_run_fkey
    foreign key (import_run_id, import_run_kind, parcel_acquisition_id, zoning_acquisition_id)
    references trulot_v2.import_run (
      import_run_id,
      run_kind,
      parcel_acquisition_id,
      zoning_acquisition_id
    );
