# Workspace scaffold — TODO

Temporary scratchpad for follow-ups left while the workspace pane
was being built. Delete this file when the items below land or get
moved into proper issues.

## Open follow-ups from the workspace-pane chunk

Smaller items, lower priority:

- **Confirm-before-switch on dirty tabs.** Today the amber "Unsaved"
  badge is the only warning if the user picks another file in the
  tree while edits are pending. The plumbing exists (`dirtyPaths`
  set in `editor-pane.tsx`); just needs the workbench to consult it
  before changing `activeRelPath`.
- **Workspace-window dirty close prompt.** Per-tab close confirms
  exist; closing the whole workspace window silently drops unsaved
  tabs. Either wire `bridge.window.setDocumentEdited` from the
  editor pane's aggregate dirty state, or grow a workspace-level handler
  in `desktop/src/main.ts` analogous to the document-window one.
- **`.grida` inline editing.** Only `.svg` mounts the editor today;
  `.grida` falls through to the read-only text (Shiki) viewer since
  it's not in the markdown / image / svg branches of
  `detectFileMode`. Needs a real editor surface for the grida
  document format.
- **Editor for `.md` and primitive text (`.txt`).** Both are
  read-only viewers today — `.md` renders through Streamdown, `.txt`
  (and anything Shiki doesn't recognise) renders through the
  highlighter at `plaintext`. Promote them to editable:
  - Minimal shape: a CodeMirror / textarea-based surface that calls
    `workspaces.writeFile` on Cmd+S and reuses the existing dirty-
    tracking contract (`onDirtyChange` from `editor-pane-tab.tsx`). No need
    for a full IDE — keep it primitive.
  - Decision to make: do markdown and plain text share a single text
    editor (with optional Streamdown preview pane), or do we ship
    them as two separate surfaces? Shared editor is simpler to keep
    consistent with the Cmd+S contract.
  - This is also when the read-only vs editable branch in
    `detectFileMode` should grow a `kind: "text-editor"` variant
    alongside the existing `kind: "text"` viewer, so the dispatcher
    stays explicit about which modes are writable.
