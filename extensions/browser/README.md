# Browser extension

The [manifest](extension.json) owns the Browser source ID, discovery summary
and skill list. [tools.json](tools.json) supplies operation schemas to the
native host and Desktop MCP adapter. Update it when an operation changes.

The [Desktop adapter](../../desktop/src/main/desktop-browser-mcp.ts) binds
those operations to the admitted page. The [Electron integration
test](../../desktop/src/main/browser-automation.electron.test.ts) exercises
background pages, visible workbench tabs and the FX viewer.
