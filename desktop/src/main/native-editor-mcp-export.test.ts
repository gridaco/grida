// GRIDA-SEC-004 — exact frame lifetime against the built MCP listener.
import { EventEmitter, once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { NativeEditorMcpExport } from "./native-editor-mcp-export";

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const token = "6a".repeat(32);
const origin = "https://editor.example.test";
const empty = { active: null, open: [], truncated: false };

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "refuses stale frame admission and never retargets a published workbench",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-editor-mcp-")
    );
    const root = path.join(base, "workspace");
    const profile = path.join(base, "browser");
    let owner: NativeEditorMcpExport | undefined;
    try {
      await Promise.all(
        [profile, root].map((directory) => fs.mkdir(directory, { mode: 0o700 }))
      );
      await fs.writeFile(
        path.join(profile, "native-mcp-export.bearer"),
        token,
        { mode: 0o600 }
      );
      const socket = net.createServer();
      socket.listen(0, "127.0.0.1");
      await once(socket, "listening");
      const address = socket.address()!;
      if (typeof address === "string")
        throw new Error("fixture_socket_invalid");
      await new Promise<void>((resolve, reject) =>
        socket.close((error) => (error ? reject(error) : resolve()))
      );
      const url = `http://127.0.0.1:${address.port}/mcp`;
      const lookup = vi
        .fn<(id: string) => Promise<string>>()
        .mockResolvedValue(root);
      owner = await NativeEditorMcpExport.start(
        [
          `--native-chat-export-mcp-root=${root}`,
          `--native-chat-export-mcp-listen=${url}`,
        ],
        profile,
        resources!,
        { editorOrigin: origin, admits: () => true, workspaceRoot: lookup }
      );
      const read = async () => {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/call",
            "mcp-name": "surface_list_open",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "surface_list_open",
              arguments: {},
              _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": {
                  name: "fixture",
                  version: "1",
                },
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            },
          }),
          signal: AbortSignal.timeout(3500),
        });
        expect(response.status).toBe(200);
        return (await response.json()).result;
      };
      const first = workbench();
      const replacement = workbench();
      const held = Promise.withResolvers<string>();
      lookup.mockReturnValueOnce(held.promise);
      const stale = owner!.publish(first.event, empty);
      expect(lookup).toHaveBeenCalledTimes(1);
      first.sender.emit("did-start-navigation", { isMainFrame: true });
      held.resolve(root);
      expect(await stale).toBe(false);
      expect(await read()).toMatchObject({
        isError: true,
        content: [{ text: "editor_surface_endpoint_unavailable" }],
      });
      expect(await owner!.publish(first.event, empty)).toBe(true);
      expect(await read()).toMatchObject({
        isError: false,
        structuredContent: { interactive: true, ...empty },
      });
      expect(await owner!.publish(replacement.event, empty)).toBe(false);
      first.sender.emit("did-start-navigation", { isMainFrame: true });
      expect(await owner!.publish(replacement.event, empty)).toBe(false);
      expect(await read()).toMatchObject({
        isError: true,
        content: [{ text: "editor_surface_endpoint_unavailable" }],
      });
    } finally {
      await owner?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  15_000
);

function workbench() {
  const frame = { url: `${origin}/desktop/workspace?id=fixture` };
  const sender = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
  });
  return {
    sender,
    event: { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent,
  };
}
