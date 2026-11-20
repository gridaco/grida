# Desktop browser automation

This reference is for contributors working on Grida's browser tools or
integrating an MCP client. For setup and everyday use, see the
[MCP client guide](../../docs/agent/grida-mcp.md#use-the-built-in-browser-from-an-mcp-client)
and [browser guide](../../docs/editor/desktop/browser.md#test-a-page-with-the-agent).

## Availability and scope

Native workspace chat can use browser tools in Act when the Desktop host and
workbench negotiate the automation capability. New native turns discover
Workbench and Browser tools as separate sources. The independent Desktop MCP
export enables its existing browser catalog with the explicit
`--native-chat-export-mcp-browser` option. That profile uses
`surface_list_open`, `surface_open`, and its original `browser_close`
contract. The default editor export retains its read-only inventory.

The tools address the workbench captured by the invocation or export. Native
workspace chat and an independent MCP client can use that workbench without
sharing their background page handles. Closing or reloading the workbench
withdraws the lease. Workspace and account changes use the existing admission
checks. The [tool-host contract](../../crates/grida-agent/docs/tool-host-contract.md)
and [security boundaries](../../SECURITY.md) describe the surrounding grants.

## Targets and lifetimes

| Target                           | Open or discover it                                                             | Lifetime                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `{ kind: "background", pageId }` | `browser_open` creates a page, even for a URL already open elsewhere            | The creating scope owns the page. Closing the page, revoking the scope, or clearing browser data retires it.               |
| `{ kind: "workbench", tabId }`   | Find a browser tab in `workbench_list_tabs` or open a URL with `workbench_show` | The user owns the tab. Reloading a page leaves its live handle in place. Closing and restoring a tab creates a new handle. |

Background work leaves the workbench selection and window focus in place.
`workbench_show` can open a URL in the workbench or select an existing tab there.
Its default `reveal` selects a tab. Use `focus` to request window and keyboard
focus, subject to platform policy. Workbench input and capture require the
requested tab to remain displayed. Background pages stay with their creating
scope.

Both targets use the shared Grida browser profile and its website sessions.
Main owns guest admission and gives each background page a never-shown window
containing a fixed sandboxed shell. The shell mounts an admitted guest through
the same one-use webview claim as the workbench. Main serializes trusted input
through the exact guest and keeps its internal debugger private. The
[Desktop browser reference](./browser.md#agent-browser-pages) covers guest
admission and ordinary browser behavior.

## Tool summary

| Tool                          | Purpose                                                                                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `workbench_list_tabs`         | Inspect file and browser tabs in the admitted workbench.                                                                                  |
| `workbench_show`              | Show a workspace file in its assigned viewer, open an HTTP(S) URL in a visible browser tab, or show an existing tab.                      |
| `workbench_close_browser_tab` | Request closure of one visible browser tab by its exact workbench tab ID.                                                                 |
| `browser_open`                | Create a background page at an HTTP(S) URL and return its target and navigation readiness.                                                |
| `browser_wait`                | Observe document readiness, text, URL or an element's state. Guard the wait with navigation readiness or a document ID where appropriate. |
| `browser_snapshot`            | Read target state and the current document's bounded accessibility tree, refs and viewport.                                               |
| `browser_navigate`            | Go to a URL, go back or forward, reload, or stop loading on a guarded document.                                                           |
| `browser_action`              | Click, fill, press, select, hover or scroll on a guarded document.                                                                        |
| `browser_capture`             | Capture viewport pixels and document and viewport metadata.                                                                               |
| `browser_diagnostics`         | Read bounded console messages, page errors and load failures.                                                                             |
| `browser_evaluate`            | Run a JavaScript function with one JSON argument in the guarded website document and return bounded JSON.                                 |
| `browser_close`               | Close an exact background page owned by this browser scope.                                                                               |
| `browser_help`                | Read operational guidance by topic.                                                                                                       |

## Work with a page

Keep the entire target object returned by `browser_open`. Pass its
`readiness` to `browser_wait` with
`condition: { kind: "ready", state: "load" }` to observe the requested
navigation, including redirects. Use `browser_snapshot({ target })` to get
the current `documentId`. A full-document replacement invalidates the old
document guard and its refs. Select the relevant element in the snapshot.

To interrupt a pending load, call `browser_navigate` with the target and
`action: { kind: "stop" }`. Omitting `documentId` applies Stop to the target's
current load. Other navigation actions require a current document guard.

For example, with the observed document ID and button ref, a click uses:

```json
{
  "target": { "kind": "background", "pageId": "<returned pageId>" },
  "documentId": "<current documentId>",
  "action": { "kind": "click", "ref": "<observed button ref>" }
}
```

Static text stays visible in snapshots. Use the containing control's ref for
interaction. Coordinate actions use top-level CSS viewport pixels and the
current `viewportId`. Scrolling, zoom and resize can invalidate coordinates.
Same-process iframe refs support observation and filling. Ref-based pointer and
key activation in those frames can return `frame_pointer_unavailable`.

Observe the result after an action. For an in-place UI update, use a fresh
snapshot or a wait with `readiness: { kind: "document", documentId }` and a
text or ref condition. A guarded wait reports when its document is stale. The
new document needs a new observation if the action triggered navigation.

Website JavaScript in `browser_evaluate` runs with the site's ordinary web
authority and can change site state. Supply a callable function as
`functionText`, for example `"value => document.title.includes(value)"`, and
its JSON argument as `arg`. Use the result or returned error before deciding
whether to repeat an effect.
An evaluation that stops waiting for an unresolved page promise can retire the
private debugger connection. Observe the page again to obtain fresh document
and element handles. Concurrent reads on that connection can fail and may be
repeated against the current page. A timeout leaves any page effects uncertain.

## Media and outcomes

MCP captures are viewport JPEGs with a 1,024-pixel long edge and a 256 KiB
binary cap. Successful results include image content and metadata for size,
viewport and reduction. Native chat projects the capture through retained
tool media on a model connection that accepts tool images.

Calls distinguish `not_dispatched`, `dispatched_verified` and `unknown`.
Dispatch confirms the tool operation, while a later observation verifies the
site outcome. After an uncertain result, observe the exact page before deciding
whether to repeat an effect. Repeating an MCP call starts another operation.

Managed website windows and prompts can require manual intervention. A human
can use the regular browser controls and DevTools. The automation contract is
the Grida tool catalog. Supported browser actions and result formats are defined
by the catalog rather than the private Electron debugger interface.

## FX viewer integration

For an authored workflow, use `grida-fx plan <workflow> --register --json` or
`grida-fx inspect <run> --register --json` to get the viewer route for a
specific plan or saved run. Registration works while the viewer is stopped.
For a running viewer, resolve the route against the URL from
`grida-fx status --project-root <project-dir> --json` for the same project.
Pass that URL to `surface_open`. Use `browser_snapshot` to identify the
current document and confirm the viewer's subject before calling its page
API through `browser_evaluate`.

For one-shot `call image.generate` results, present the saved PNG directly.
FX 0.11.0 can register the run but its viewer rejects the inline workflow graph.
The PNG and the record returned by `grida-fx inspect` remain usable.
