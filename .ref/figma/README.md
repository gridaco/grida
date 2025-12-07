# Figma typings reference

| Type       | Source                          | Description                                | Last Updated |
| ---------- | ------------------------------- | ------------------------------------------ | ------------ |
| Plugin API | [plugin-api.d.ts][plugin-types] | Official Figma Plugin API type definitions | 2025-06-07   |
| REST API   | [api_types.ts][rest-types]      | Official Figma REST API type definitions   | 2025-06-07   |

## .fig File Format - Kiwi Schema

The `.fig` file format uses Kiwi, a schema-based binary encoding protocol. We maintain an extracted schema definition and custom tooling to work with it.

| File              | Description                                        | Last Updated |
| ----------------- | -------------------------------------------------- | ------------ |
| [fig.kiwi][]      | Extracted Kiwi schema definition for .fig format   | 2025-12-04   |
| [fig.kiwi.d.ts][] | TypeScript type definitions for .fig format        | 2025-12-04   |
| [fig2kiwi.ts][]   | Deno script to extract Kiwi schema from .fig files | 2025-12-04   |

### Schema Extraction

The schema files are extracted using `fig2kiwi.ts`, a standalone Deno script that:

1. Parses `.fig` files (handles both raw archives and ZIP-wrapped files)
2. Extracts the schema from the first chunk
3. Converts it to human-readable Kiwi schema format
4. Generates TypeScript type definitions

**Usage:**

```bash
# Generates fig.kiwi and fig.kiwi.d.ts
deno run --allow-read --allow-write --allow-net fig2kiwi.ts <input.fig> [output-name]

# Example with custom name
deno run --allow-read --allow-write --allow-net fig2kiwi.ts file.fig schema
# Outputs: schema.kiwi and schema.kiwi.d.ts
```

[plugin-types]: https://github.com/figma/plugin-typings/blob/master/plugin-api.d.ts
[rest-types]: https://github.com/figma/rest-api-spec/blob/main/dist/api_types.ts
[fig.kiwi]: ./fig.kiwi
[fig.kiwi.d.ts]: ./fig.kiwi.d.ts
[fig2kiwi.ts]: ./fig2kiwi.ts
