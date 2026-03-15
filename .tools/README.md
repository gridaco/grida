# Internal Developer Tools

This directory contains miscellaneous, trivial scripts that are useful for internal developers during development and debugging.

**Note:** These scripts are not part of any build pipeline or main workflow. They are utility tools for ad-hoc tasks and manual operations.

## Available Tools

| Tool               | Description                                                      | Usage                                                                |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pbdump.swift`     | Dump macOS clipboard contents (all UTI types)                    | `swift pbdump.swift`                                                 |
| `figma_archive.py` | Archive a Figma file via REST API (document.json + images/)      | `python .tools/figma_archive.py --filekey <key> --archive-dir <dir>` |
| `model_info.py`    | Look up model specs (context window, cost, etc.) from models.dev | `python .tools/model_info.py <model_id>`                             |

### `model_info.py`

Fetches the [models.dev](https://models.dev) catalog and prints context window, output limit, cost, and capabilities for a given model ID. Useful when updating `editor/lib/ai/models.ts` after bumping model assignments.

```sh
# Exact match
python .tools/model_info.py openai/gpt-5-mini

# Substring search (shows all matches)
python .tools/model_info.py claude-sonnet-4

# Prints a summary line for easy copy-paste into models.ts:
#   openai/gpt-5-mini: contextWindow=400000, outputLimit=128000
```

Requires `curl` (uses it under the hood to avoid Python SSL issues on macOS).

## Contributing

Feel free to add new utility scripts here as needed. Keep them simple, well-commented, and document them in this README.
