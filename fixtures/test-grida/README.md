## Test `.grida` fixtures

This directory contains **meaningful** `.grida` files used for **testing**.

### File formats

- **`.grida` files**: Modern format using ZIP/FlatBuffer binary format. These are the current production format.
- **`.grida1.zip` files**: Legacy/test-only format containing JSON snapshots in a ZIP archive. Used for internal testing and fixtures. Not part of the public `.grida` file format specification.

### Naming convention

- **Prefix**: `d[n]` is a simple counter (`d1`, `d2`, `d3`, ...).
- **Schema version specifier**: we encode the schema version **build metadata date** as `yyyymmdd`.
  - Example: schema version `0.90.0-beta+20260108` → version specifier `20260108`
  - **Note**: this `yyyymmdd` is **not** the authoring date of the file.

### Support expectations (important)

- The Grida schema evolves rapidly; **tests should prefer replacing fixtures** with current ones rather than migrating old fixtures forever.
- Some fixtures here may be **legacy** and can become **permanently unsupported**. They are kept for **historical context** and **current-version regression testing only**.
- **Do not use these files in production**, and **do not assume** every file in this folder will load in the latest version.

### Changelog

- **2026-01-03**: Migrated from legacy `.grida` (JSON/ZIP) format to new `.grida` (ZIP/FlatBuffer) binary format. Legacy snapshot files are now stored as `.grida1.zip` for test fixtures.

> Current Version: `0.90.0-beta+20260108` (last updated: 2026-01-08)
