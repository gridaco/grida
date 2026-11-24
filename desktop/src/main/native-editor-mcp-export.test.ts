// GRIDA-SEC-004 — exact frame lifetime against the built MCP listener.
import { EventEmitter, once } from "node:events";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import browserToolCatalog from "../../../extensions/browser/tools.json";
import { NativeEditorMcpExport } from "./native-editor-mcp-export";
import { DesktopWorkbenchInventory } from "./desktop-workbench-inventory";

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
      const request = async (
        method: "tools/list" | "tools/call",
        args = {}
      ) => {
        const calling = method === "tools/call";
        const response = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": method,
            ...(calling && {
              "mcp-name": DesktopWorkbenchInventory.definition.name,
            }),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params: {
              ...(calling && {
                name: DesktopWorkbenchInventory.definition.name,
                arguments: args,
              }),
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
      const read = () => request("tools/call");
      await expect(request("tools/list")).resolves.toMatchObject({
        tools: [DesktopWorkbenchInventory.definition],
      });
      await expect(
        request("tools/call", { workspace: "other" })
      ).resolves.toMatchObject({
        isError: true,
        content: [{ type: "text", text: "invalid_editor_surface_arguments" }],
      });
      await expect(
        request("tools/call", { workspace: "x".repeat(32 * 1024 - 32) })
      ).resolves.toMatchObject({
        isError: true,
        content: [{ type: "text", text: "desktop_tool_invalid_request" }],
      });
      expect(lookup).not.toHaveBeenCalled();
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
      await expect(request("tools/list")).resolves.toMatchObject({
        tools: [DesktopWorkbenchInventory.definition],
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

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "correlates independent browser calls and revokes the export when its workbench retires",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-browser-mcp-")
    );
    const root = path.join(base, "workspace");
    const profile = path.join(base, "browser");
    const held = Promise.withResolvers<void>();
    let owner: NativeEditorMcpExport | undefined;
    try {
      await Promise.all(
        [root, profile].map((directory) => fs.mkdir(directory, { mode: 0o700 }))
      );
      await fs.writeFile(
        path.join(profile, "native-mcp-export.bearer"),
        token,
        { mode: 0o600 }
      );
      const socket = net.createServer();
      socket.listen(0, "127.0.0.1");
      await once(socket, "listening");
      const port = socket.address();
      if (!port || typeof port === "string")
        throw new Error("fixture_socket_invalid");
      await new Promise<void>((resolve, reject) =>
        socket.close((error) => (error ? reject(error) : resolve()))
      );
      const url = `http://127.0.0.1:${port.port}/mcp`;
      const admitted = workbench();
      const entered = Promise.withResolvers<void>();
      const close = vi.fn<() => void>();
      const closeArguments: unknown[] = [];
      const visibleTarget = { kind: "workbench", tabId: "visible-browser-tab" };
      owner = await NativeEditorMcpExport.start(
        [
          `--native-chat-export-mcp-root=${root}`,
          `--native-chat-export-mcp-listen=${url}`,
          "--native-chat-export-mcp-browser",
        ],
        profile,
        resources!,
        {
          editorOrigin: origin,
          admits: () => true,
          workspaceRoot: async () => root,
          browserLease: (sender, frame, requireCurrent) => {
            expect(sender).toBe(admitted.sender);
            expect(frame).toBe(admitted.event.senderFrame);
            return {
              ready: () => true,
              close,
              invoke: async (operation, args) => {
                requireCurrent();
                if (operation === "browser_close") {
                  closeArguments.push(args);
                  return {
                    disposition: "dispatched_verified",
                    data: { closed: true },
                  };
                }
                expect(operation).toBe("browser_open");
                const marker = (args as { url: string }).url;
                if (marker.endsWith("/first")) {
                  entered.resolve();
                  await held.promise;
                }
                return { disposition: "dispatched_verified", data: { marker } };
              },
            };
          },
        }
      );
      expect(await owner!.publish(admitted.event, empty, 1)).toBe(true);
      let id = 0;
      const request = async (call?: { name: string; arguments: object }) => {
        const method = call ? "tools/call" : "tools/list";
        const response = await fetch(url, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": method,
            ...(call && { "mcp-name": call.name }),
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: ++id,
            method,
            params: {
              ...call,
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
          signal: AbortSignal.timeout(4000),
        });
        expect(response.status).toBe(200);
        return (await response.json()).result;
      };
      const listing = await request();
      expect(listing.tools).toEqual(
        browserToolCatalog.map(
          ({ name, description, inputSchema, outputSchema }) => ({
            name,
            description,
            inputSchema,
            outputSchema,
          })
        )
      );
      expect(listing.tools.map((tool: { name: string }) => tool.name)).toEqual(
        expect.arrayContaining([
          "surface_list_open",
          "surface_open",
          "browser_close",
        ])
      );
      const invoke = (marker: string) =>
        request({ name: "browser_open", arguments: { url: marker } });
      const firstUrl = "http://localhost:3000/first";
      const secondUrl = "http://localhost:3000/second";
      const first = invoke(firstUrl);
      // Retain a rejection handler in case a later fixture assertion fails.
      void first.catch(() => {});
      await entered.promise;
      expect(await invoke(secondUrl)).toMatchObject({
        isError: false,
        structuredContent: { marker: secondUrl },
      });
      held.resolve();
      expect(await first).toMatchObject({
        isError: false,
        structuredContent: { marker: firstUrl },
      });
      expect(
        await request({
          name: "browser_close",
          arguments: { target: visibleTarget },
        })
      ).toMatchObject({
        isError: false,
        structuredContent: { closed: true },
      });
      expect(closeArguments).toEqual([{ target: visibleTarget }]);
      owner!.retireView(admitted.event, 1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(await owner!.publish(admitted.event, empty, 2)).toBe(false);
      expect(await invoke(secondUrl)).toMatchObject({
        isError: true,
        structuredContent: {
          error: "owner_revoked",
          disposition: "not_dispatched",
        },
      });
    } finally {
      held.resolve();
      await owner?.close();
      await fs.rm(base, { recursive: true, force: true });
    }
  },
  15_000
);
