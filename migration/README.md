# Legacy data migration

We will migrate data from the legacy Derby or MySQL databases into the new MySQL schema.

## Sources
- Derby: `database/derby-server/posdb.zip`
- MySQL: existing production DB (connection details needed)

## Approach
1. Export legacy data to JSON using the JDBC-based extractor.
2. Stage legacy JSON into `legacy_records` in MySQL.
3. Map staged data into the new schema with a dedicated transformer (next phase).

## Tools
- `legacy-exporter/` — Java CLI that exports tables to JSON files.
- `backend/scripts/import-legacy.ts` — stages JSON into MySQL.
- `backend/scripts/transform-legacy.ts` — maps core tables into the new schema.

## Usage
1. Build the exporter in `legacy-exporter/`.
2. Run the exporter with `--jdbc`, `--user`, `--password`, and `--out`.
3. Run `backend/scripts/import-legacy.ts` with `LEGACY_EXPORT_DIR=...`.
4. Run `backend/scripts/transform-legacy.ts` with `LEGACY_EXPORT_DIR=...`.

## Notes
- User passwords are not migrated. Accounts are created with a placeholder hash and must be reset.
- Card numbers are masked during import.
