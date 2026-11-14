---
title: Connect another agent to Grida with MCP
description: Connect a local MCP client to the standalone Grida tool host or to the open tabs of a Desktop workspace.
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

Available in a source-built host on macOS and Linux.

After [building the native host](./clients.md#build-the-host), generate a
local token and start the listener.

```sh
export GRIDA_MCP_SERVER_TOKEN="$(openssl rand -hex 32)"

target/debug/grida-agent serve-mcp \
  --listen http://127.0.0.1:8766/mcp \
  --server-token-env GRIDA_MCP_SERVER_TOKEN
```

In your MCP client, add a Streamable HTTP server with the URL
`http://127.0.0.1:8766/mcp` and the header
`Authorization: Bearer <the token you exported>`. The client should then list
the `surface_open` tool.

`surface_open` takes a workspace path beginning with `/`. Calling it reports
`not_interactive`, because no editor is attached, which confirms the
connection works. The call provides no file access. A headless run can offer
the same tool directly with `--headless-surface`.
[Connect a local MCP client](./clients.md#connect-a-local-mcp-client)

## Read open tabs from Desktop

Available on macOS and Linux when you start Grida Desktop from source or use
an Insiders build with the options below; not in the regular release.

Desktop can export `surface_list_open` for one selected workspace. It is
read-only and exports no document edits. Prepare the separate `--native-chat`
profile and place a
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

After you open the selected workspace, the tool returns the active file and
the open tabs as workspace-relative paths, without file contents. With no
files open it returns an empty list. Before the workspace window opens, or
after it navigates away, closes or signs out, the tool reports that the view
is unavailable. Restart Desktop with the same options to export it again.

To give Grida's own agent tools from another local server, use the separate
[client-side MCP setup](./skills-and-tools.md#use-tools-from-a-local-mcp-server).
