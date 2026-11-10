// GRIDA-SEC-004 — Main's scoped MCP launch against the actual native process.
import fs from "node:fs/promises";
import { EventEmitter } from "node:events";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { DesktopAccountSession } from "./account-session";
import { NativeGatewayConnection } from "./native-gateway-connection";
import { NativeMcpLaunch } from "./native-mcp-launch";
import { NativeChatIpc } from "./native-chat-ipc";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";

const sidecar = vi.hoisted(() => ({
  sealLegacyChatForColdStart:
    vi.fn<
      typeof import("./agent-sidecar-supervisor").sealLegacyChatForColdStart
    >(),
  nativeAgentGatewayConnection:
    vi.fn<
      typeof import("./agent-sidecar-supervisor").nativeAgentGatewayConnection
    >(),
  findWorkspace:
    vi.fn<
      typeof import("./agent-sidecar-client").agentSidecarClient.findWorkspace
    >(),
}));
vi.mock("./agent-sidecar-supervisor", () => sidecar);
vi.mock("./agent-sidecar-client", () => ({ agentSidecarClient: sidecar }));

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;
const token = "fixture.local.peer.bearer";
const toolName = "mcp_local_lookup";

it.runIf(Boolean(resources) && process.platform !== "win32")(
  "gives only the selected Gateway workspace its allowlisted MCP tool, and only for Act",
  async () => {
    const base = await fs.mkdtemp(
      path.join(await fs.realpath(os.tmpdir()), "grida-native-desktop-mcp-")
    );
    const source = {
      userDataPath: path.join(base, "agent"),
      desktopUserDataPath: path.join(base, "browser"),
      scratchBase: path.join(base, "scratch"),
      providerHome: path.join(base, "agent"),
      mediaRoot: path.join(base, "media"),
    };
    const root = path.join(base, "workspace");
    const other = path.join(base, "other");
    const methods: string[] = [];
    const toolCalls: unknown[] = [];
    const faults: unknown[] = [];
    const server = http.createServer(async (request, response) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk);
        const rpc = JSON.parse(Buffer.concat(chunks).toString());
        expect(request.url).toBe("/mcp");
        expect(request.method).toBe("POST");
        expect(request.headers.authorization).toBe(`Bearer ${token}`);
        expect(request.headers["mcp-protocol-version"]).toBe("2026-07-28");
        expect(request.headers["mcp-method"]).toBe(rpc.method);
        methods.push(rpc.method);
        let result: unknown;
        switch (rpc.method) {
          case "server/discover":
            result = {
              resultType: "complete",
              supportedVersions: ["2026-07-28"],
              capabilities: { tools: {} },
              ttlMs: 0,
              cacheScope: "private",
            };
            break;
          case "tools/list":
            result = {
              resultType: "complete",
              tools: ["lookup", "unselected"].map((name) => ({
                name,
                inputSchema: { type: "object" },
              })),
            };
            break;
          case "tools/call":
            toolCalls.push({
              nameHeader: request.headers["mcp-name"],
              params: rpc.params,
            });
            result = {
              resultType: "complete",
              content: [{ type: "text", text: "Exact local result" }],
            };
            break;
          default:
            throw new Error("unexpected fixture MCP method");
        }
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
      } catch (error) {
        faults.push(error);
        response.writeHead(500).end();
      }
    });
    let agent: import("./native-desktop-agent").NativeDesktopAgent | undefined;
    try {
      await Promise.all(
        [root, other, source.userDataPath, source.desktopUserDataPath].map(
          (directory) => fs.mkdir(directory, { mode: 0o700 })
        )
      );
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject).listen(0, "127.0.0.1", resolve);
      });
      const address = server.address()!;
      if (typeof address === "string")
        throw new Error("fixture socket address missing");
      await fs.writeFile(
        path.join(source.desktopUserDataPath, "native-mcp.bearer"),
        token,
        { mode: 0o600 }
      );
      const mcp = await NativeMcpLaunch.configure(
        [
          `--native-chat-mcp-root=${root}`,
          `--native-chat-mcp-endpoint=http://127.0.0.1:${address.port}/mcp`,
          "--native-chat-mcp-source=local",
          "--native-chat-mcp-tool=lookup",
        ],
        source.desktopUserDataPath,
        "gateway"
      );
      sidecar.sealLegacyChatForColdStart.mockResolvedValue(source);
      const catalog = new NativeWorkspaceCatalog({
        browserData: source.desktopUserDataPath,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [source.userDataPath],
      });
      const selected = await catalog.openSelected(root);
      const unselected = await catalog.openSelected(other);
      sidecar.findWorkspace.mockImplementation((id) => catalog.find(id));
      let organizationId = 12;
      const offers: string[][] = [];
      const bodies: string[] = [];
      const origin = "https://gateway.example.test";
      sidecar.nativeAgentGatewayConnection.mockImplementation(async () =>
        NativeGatewayConnection.open({
          origin,
          account: {
            withGatewayGrant: async (_, accept) =>
              accept({
                token: "fixture.gateway.bearer",
                subject: "synthetic-user",
                organizationId,
                expiresAt: Date.now() + 120_000,
                isCurrent: () => true,
              }),
          },
          network: {
            prepare: (target, headers) => {
              expect(target).toBe(`${origin}/api/v1/ai/chat/completions`);
              expect(headers.get("authorization")).toBe(
                "Bearer fixture.gateway.bearer"
              );
              return async (body) => {
                const text = body.toString();
                bodies.push(text);
                const request = JSON.parse(text);
                const names = (request.tools ?? []).map(
                  (item: { function: { name: string } }) => item.function.name
                );
                offers.push(names);
                if (
                  names.includes(toolName) &&
                  !request.messages.some(
                    (item: { role: string }) => item.role === "tool"
                  )
                ) {
                  return stream(
                    {
                      tool_calls: [
                        {
                          index: 0,
                          id: "fixture-mcp-call",
                          type: "function",
                          function: {
                            name: toolName,
                            arguments: '{"label":"sample"}',
                          },
                        },
                      ],
                    },
                    "tool_calls"
                  );
                }
                return stream({ content: "Synthetic completion" }, "stop");
              };
            },
          },
        })
      );
      const { NativeDesktopAgent } = await import("./native-desktop-agent");
      agent = await NativeDesktopAgent.prepareFresh(
        new DesktopAccountSession({
          base_url: origin,
          fetch: vi.fn<typeof fetch>(),
        }),
        resources!,
        {
          provider: "gateway",
          openExternal: vi.fn<(url: string) => Promise<void>>(),
          mcp,
        }
      );
      const desktop = agent;
      async function send(workspaceId: string, mode: "act" | "plan") {
        await desktop.ensure(workspaceId);
        const active = desktop.current(workspaceId)!;
        const frame = { url: `${origin}/desktop/workspace?id=${workspaceId}` };
        const sender = Object.assign(new EventEmitter(), {
          mainFrame: frame,
          isDestroyed: () => false,
          isLoadingMainFrame: () => false,
        });
        const event = {
          sender,
          senderFrame: frame,
        } as unknown as IpcMainInvokeEvent;
        const ipc = new NativeChatIpc(origin, () => active);
        const session = await ipc.create(event);
        ipc.publishEditorSurfaces(
          event,
          session.attachmentId,
          { active: "/poster.svg", open: ["/poster.svg"], truncated: false },
          1
        );
        await ipc.submit(
          event,
          session.attachmentId,
          `test-${mode}`,
          "A harmless local lookup",
          mode
        );
        await vi.waitFor(
          async () => {
            const { snapshot } = await ipc.observe(event, session.attachmentId);
            expect(snapshot.latest?.status).toBe("succeeded");
          },
          { timeout: 5000 }
        );
      }
      await send(unselected.id, "act");
      expect(methods).toEqual([]);
      await send(selected.id, "plan");
      expect(methods).toEqual(["server/discover", "tools/list"]);
      await send(selected.id, "act");
      expect(methods).toEqual(["server/discover", "tools/list", "tools/call"]);
      expect(toolCalls).toMatchObject([
        {
          nameHeader: "lookup",
          params: { name: "lookup", arguments: { label: "sample" } },
        },
      ]);
      expect(faults).toEqual([]);
      expect(
        offers.map((names) => names.filter((name) => name.startsWith("mcp_")))
      ).toEqual([[], [], [toolName], [toolName]]);
      expect(
        offers.map((names) =>
          names.filter(
            (name) => name.startsWith("surface_") || name.startsWith("svg_")
          )
        )
      ).toEqual([["surface_list_open", "surface_open"], [], [], []]);
      expect(bodies.at(-1)).toContain("Exact local result");
      expect(bodies.join("")).not.toContain(token);
      await desktop.clearAccount();
      organizationId = 13;
      await expect(desktop.ensure(selected.id)).rejects.toThrow(
        "native_desktop_mcp_gateway_scope_changed"
      );
      expect(methods).toHaveLength(3);
    } finally {
      try {
        await agent?.close();
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await fs.rm(base, { recursive: true, force: true });
      }
    }
  },
  25_000
);

function stream(delta: object, finishReason: string): Response {
  const event = (delta: object, finish_reason: string | null) =>
    `data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  return new Response(
    event(delta, null) + event({}, finishReason) + "data: [DONE]\n\n",
    {
      headers: { "content-type": "text/event-stream" },
    }
  );
}
