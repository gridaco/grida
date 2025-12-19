## Test `.grida` fixtures

This directory contains **meaningful** `.grida` files used for **testing**.

### Naming convention

- **Prefix**: `d[n]` is a simple counter (`d1`, `d2`, `d3`, ...).
- **Schema version specifier**: we encode the schema version **build metadata date** as `yyyymmdd`.
  - Example: schema version `0.89.0-beta+20251219` → version specifier `20251209`
  - **Note**: this `yyyymmdd` is **not** the authoring date of the file.

### Support expectations (important)

- The Grida schema evolves rapidly; **tests should prefer replacing fixtures** with current ones rather than migrating old fixtures forever.
- Some fixtures here may be **legacy** and can become **permanently unsupported**. They are kept for **historical context** and **current-version regression testing only**.
- **Do not use these files in production**, and **do not assume** every file in this folder will load in the latest version.

> Current Version: `0.89.0-beta+20251219` (last updated: 2025-12-19)
