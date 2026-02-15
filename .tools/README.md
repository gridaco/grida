# Internal Developer Tools

This directory contains miscellaneous, trivial scripts that are useful for internal developers during development and debugging.

**Note:** These scripts are not part of any build pipeline or main workflow. They are utility tools for ad-hoc tasks and manual operations.

## Available Tools

| Tool               | Description                                                 | Usage                                                                |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| `pbdump.swift`     | Dump macOS clipboard contents (all UTI types)               | `swift pbdump.swift`                                                 |
| `figma_archive.py` | Archive a Figma file via REST API (document.json + images/) | `python .tools/figma_archive.py --filekey <key> --archive-dir <dir>` |

## Contributing

Feel free to add new utility scripts here as needed. Keep them simple, well-commented, and document them in this README.
