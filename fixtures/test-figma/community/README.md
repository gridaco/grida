# Figma REST API archive fixtures (Figma Community)

ZIP archives of Figma REST API responses: `document.json` (with `geometry=paths`) and `images/` (downloaded image fills). Created with [`.tools/figma_archive.py`](../../.tools/figma_archive.py).

These match the `.fig` fixtures in [`test-fig/community`](../test-fig/community/) — same source files, different formats. Use the REST archive for tests that need document JSON + images without Figma API calls.

| Name                   | File ID              | REST archive                                                                                                   | .fig (binary)                                                                                      | Link                                                            |
| ---------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Auto Layout Playground | `784448220678228461` | [`784448220678228461-figma-auto-layout-playground.zip`](./784448220678228461-figma-auto-layout-playground.zip) | [test-fig/community](../../test-fig/community/784448220678228461-figma-auto-layout-playground.fig) | [View](https://www.figma.com/community/file/784448220678228461) |

## Layout (per archive)

```
<name>.zip
└── <name>/
    ├── document.json   # GET /v1/files/:key?geometry=paths
    └── images/
        └── <ref>.<ext> # Image fills from GET /v1/files/:key/images
```

## Regenerating

```sh
python .tools/figma_archive.py --filekey 784448220678228461 --archive-dir /tmp/arch
# Then zip the output and replace the fixture.
```
