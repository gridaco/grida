# Figma REST API archive fixtures (Figma Community)

Archives created with [`.tools/figma_archive.py`](../../.tools/figma_archive.py) (see script header for output layout and flags). These match the `.fig` fixtures in [`test-fig/community`](../test-fig/community/).

| Name                   | File ID               | REST archive                                                                                                   | .fig (binary)                                                                                      | Link                                                             |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Auto Layout Playground | `784448220678228461`  | [`784448220678228461-figma-auto-layout-playground.zip`](./784448220678228461-figma-auto-layout-playground.zip) | [test-fig/community](../../test-fig/community/784448220678228461-figma-auto-layout-playground.fig) | [View](https://www.figma.com/community/file/784448220678228461)  |
| Radix Icons            | `1510053249065427020` | [`1510053249065427020-workos-radix-icons.zip`](./1510053249065427020-workos-radix-icons.zip)                   | [test-fig/community](../../test-fig/community/1510053249065427020-workos-radix-icons.fig)          | [View](https://www.figma.com/community/file/1510053249065427020) |

## Regenerating

```sh
python .tools/figma_archive.py --filekey 784448220678228461 --archive-dir /tmp/arch
# Then zip the output and replace the fixture.
```
