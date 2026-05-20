# Grida Desktop — Technical Preview

This is a nightly release of Grida `{{version}}`.

- macOS (signed, notarized)
  - darwin arm64 — Apple Silicon
  - dmg · zip
- linux
  - deb · rpm
  - arm64 · x64
- windows (not signed)
  - x64

[Join Slack](https://grida.co/join-slack) to learn more.

## Supported builds

| Name    | Platform | x64 | arm64 | makers           | signed | notes                                                             |
| ------- | -------- | --- | ----- | ---------------- | ------ | ----------------------------------------------------------------- |
| `Grida` | `darwin` |     | ✓     | `zip`, `dmg`     | ✓      | Apple Silicon only. Rosetta 2 cannot run arm64 binaries on Intel. |
| `Grida` | `win32`  | ✓   |       | `exe (squirrel)` |        | x64 only / not signed                                             |
| `Grida` | `linux`  | ✓   | ✓     | `deb`, `rpm`     |        |                                                                   |

## Auto-update

macOS installs receive updates automatically via [`update.electronjs.org`](https://github.com/electron/update.electronjs.org). The running app polls every 6 hours; when a newer release is available, a "Restart to update" prompt appears.

Releases marked **pre-release** on this page are _not_ served to existing installs — they're for manual download / testing only.
