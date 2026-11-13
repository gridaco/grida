---
title: Connect another agent to Grida with MCP
description: Connect a local MCP client to the standalone Grida tool host or the isolated Desktop preview's workbench export.
keywords: [agent, MCP, Grida Desktop, open tabs, Streamable HTTP]
format: md
---

# Connect another agent to Grida with MCP

Grida can serve tools to a local MCP client without starting a Grida chat or
contacting a model provider. Configure the client for **Streamable HTTP** on
the exact numeric loopback address and include `Authorization: Bearer …`
with the dedicated token. The host supports stateless MCP revisions
`2026-07-28` and `2025-11-25`.

## Run the standalone tool host

After [building the native host](./clients.md#build-the-host), generate a
local token and start the listener.

```sh
export GRIDA_MCP_SERVER_TOKEN="$(openssl rand -hex 32)"

target/debug/grida-agent serve-mcp \
  --listen http://127.0.0.1:8766/mcp \
  --server-token-env GRIDA_MCP_SERVER_TOKEN
```

The standalone host offers `surface_open`. It takes a workspace path beginning
with `/` and reports `not_interactive` because there is no editor attached.
The call provides no file access. The same capability is available directly
in a native headless Act launch with `--headless-surface`.

## Read open tabs from Desktop

The isolated Desktop preview (development or Insiders builds) can export
`surface_list_open` for one selected workspace. It is read-only; no document
edit operations are exported yet. Prepare the isolated `--native-chat` profile and place a
separate 64-character hexadecimal token in `native-mcp-export.bearer` under
its `--user-data-dir`. Use mode `0600` or `0400` and omit the trailing newline.
[Desktop launch setup](https://github.com/gridaco/grida/blob/main/desktop/README.md#distributions)

Add these options at launch.

```sh
--native-chat-export-mcp-root=/absolute/canonical/workspace \
--native-chat-export-mcp-listen=http://127.0.0.1:8767/mcp
```

Connect your local client with that bearer, then open the selected workspace
in Desktop.

The first admitted workbench frame for that folder publishes the active file
and a bounded list of open tabs as workspace-relative paths. The result
contains no file contents. A workbench with no open files returns an empty
view. Before it publishes, or after it navigates, closes, or signs out, the
tool reports that the view is unavailable. Start a new explicit export to
select a replacement frame.

To give Grida's own agent tools from another local server, use the separate
[client-side MCP setup](./skills-and-tools.md#use-the-tools-available-to-the-task).
