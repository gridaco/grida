# @grida/svg-editor

## 1.0.0-alpha.26

### Patch Changes

- Delete / Backspace in path edit mode (`mode === "edit-content"`) now removes the sub-selected vertices / segments / tangents instead of detaching the whole element ([#880](https://github.com/gridaco/grida/issues/880)). `selection.remove` is guarded on `select` mode, and a new `vector.delete-vertex` command honors the policy-class `delete-vertex` verdict (vertex-chain `restrict` — polygon ≥ 3, polyline ≥ 2, line keeps 2; path `bake`). Deletion is a single undo step that restores both the geometry and the sub-selection; tangent-only deletes preserve untouched segments' authored verbs.
