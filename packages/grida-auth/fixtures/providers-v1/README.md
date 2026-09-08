# Provider v1 compatibility fixtures

**GRIDA-SEC-014** — all credential strings are synthetic. Each input is owned by
the [v1 protocol](../../PROVIDER-CREDENTIALS-V1.md) and exercised through the public
provider store. Ports can reuse these files without a Node runtime.

| File                   | Expected outcome                                                               |
| ---------------------- | ------------------------------------------------------------------------------ |
| `empty.toml`           | Empty, unstarted authority.                                                    |
| `escaping.toml`        | Example key is `synthetic-"-\-α-🙂`, with those exact scalar values.           |
| `tombstone.toml`       | Example is absent and cannot import from a later source.                       |
| `pending.toml`         | Ordinary operations fail `migration_pending`; migrate retries retirement only. |
| `unknown-version.toml` | Fail `unsupported_version`, without modifying the file.                        |
| `unknown-field.toml`   | Fail `invalid_store`; OAuth fields are outside the schema.                     |

The producer tests additionally construct malformed UTF-8 (`C3 28`), UTF-8 BOM,
invalid TOML, duplicate fields, control characters, invalid Unicode, key byte
bounds, provider-count bounds, and a file exceeding 1,048,576 bytes. Those byte
vectors are generated from fixed literals without external fixtures or services.
