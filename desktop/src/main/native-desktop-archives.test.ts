// GRIDA-SEC-004 / GRIDA-SEC-014 — production composition for ordinary and isolated Desktop.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaDaemon } from "@grida/ai-host/media-server";
import type { IpcMainInvokeEvent } from "electron";

const sidecar = vi.hoisted(() => ({
  selectNativeChat:
    vi.fn<typeof import("./services-sidecar-supervisor").selectNativeChat>(),
  nativeAgentSubscriptionSettings:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentSubscriptionSettings
    >(),
  nativeAgentGatewayConnection:
    vi.fn<
      typeof import("./services-sidecar-supervisor").nativeAgentGatewayConnection
    >(),
  getServicesSidecarInfo:
    vi.fn<
      typeof import("./services-sidecar-supervisor").getServicesSidecarInfo
    >(),
}));
vi.mock("./services-sidecar-supervisor", () => sidecar);
vi.mock("../env", () => ({ EDITOR_BASE_URL: "https://fixture.invalid" }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.runIf(process.platform !== "win32")(
  "Desktop archive composition",
  () => {
    it.each(["ordinary", "isolated"] as const)(
      "serves Settings through the actual %s workspace adapter without starting a model",
      async (mode) => {
        vi.resetModules();
        const base = await fs.mkdtemp(
          path.join(
            await fs.realpath(os.tmpdir()),
            "grida-archive-composition-"
          )
        );
        const root = path.join(base, "project");
        const source = {
          userDataPath: path.join(base, "agent"),
          desktopUserDataPath: path.join(base, "browser"),
          providerHome: path.join(base, "providers"),
          mediaRoot: path.join(base, "media"),
        };
        await Promise.all(
          [root, ...Object.values(source)].map((directory) =>
            fs.mkdir(directory, { mode: 0o700 })
          )
        );
        const origin = new URL((await import("../env")).EDITOR_BASE_URL).origin;
        const password = "archive-fixture-password";
        const daemon = createMediaDaemon({
          password,
          user_data_path: source.userDataPath,
          provider_home: source.providerHome,
          http_access: {
            allowed_origins: [origin],
            allowed_referer_paths: ["/desktop"],
          },
          capabilities: { workspaces: true, files: false, recent: false },
        });
        const fetch = vi
          .fn<typeof globalThis.fetch>()
          .mockImplementation(async (input, init) =>
            daemon.fetch(new Request(input, init))
          );
        vi.stubGlobal("fetch", fetch);
        sidecar.selectNativeChat.mockReturnValue(source);
        sidecar.getServicesSidecarInfo.mockReturnValue({
          port: 12345,
          password,
        } as ReturnType<
          typeof import("./services-sidecar-supervisor").getServicesSidecarInfo
        >);
        sidecar.nativeAgentSubscriptionSettings.mockResolvedValue({
          userDataPath: source.userDataPath,
          network: { prepare: () => null },
        });
        sidecar.nativeAgentGatewayConnection.mockClear();
        const { NativeDesktopAgent } = await import("./native-desktop-agent");
        const { DesktopAccountSession } = await import("./account-session");
        const { servicesSidecarClient } =
          await import("./services-sidecar-client");
        const { NativeAgentChat } = await import("./native-agent-chat");
        const start = vi.spyOn(NativeAgentChat, "start");
        const { createDesktopArchives } =
          await import("./native-desktop-archives");
        const { NativeArchiveIpc } = await import("./native-archive-ipc");
        let native:
          | import("./native-desktop-agent").NativeDesktopAgent
          | undefined;
        try {
          await daemon.start({ listen: false });
          let workspace;
          let workspaceGrant;
          if (mode === "isolated") {
            const { NativeWorkspaceCatalog } =
              await import("./native-workspace-catalog");
            const catalog = new NativeWorkspaceCatalog({
              browserData: source.desktopUserDataPath,
              projectsRoot: path.join(base, "projects"),
              protectedPaths: [source.userDataPath, source.providerHome],
            });
            await catalog.initialize();
            workspace = await catalog.openSelected(root);
            workspaceGrant = catalog.fileGrant.bind(catalog);
            servicesSidecarClient.setWorkspaceCatalog(catalog);
          } else {
            // Ordinary Desktop uses retained-service workspace HTTP, not the
            // isolated nativeProfile-only local catalog variable from main.ts.
            workspace = await servicesSidecarClient.openWorkspace(root);
          }
          const account = new DesktopAccountSession({
            base_url: origin,
            fetch: async () => {
              throw new Error(
                "archive must not request model/account credentials"
              );
            },
          });
          native =
            mode === "ordinary"
              ? await NativeDesktopAgent.prepareOrdinary(
                  account,
                  "/fixture/resources",
                  [],
                  { openExternal: async () => {} }
                )
              : await NativeDesktopAgent.prepareFresh(
                  account,
                  "/fixture/resources",
                  {
                    workspaceGrant,
                    provider: "gateway",
                    openExternal: async () => {},
                  }
                );
          await expect(native.catalogWorkspace(workspace.id)).resolves.toEqual({
            root,
          });
          const owner = createDesktopArchives(native, "/fixture/resources");
          expect(owner).toBeDefined();
          const frame = {
            url: `${origin}/desktop/settings?tab=archived-chats`,
          };
          const event = {
            senderFrame: frame,
            sender: {
              mainFrame: frame,
              isDestroyed: () => false,
              isLoadingMainFrame: () => false,
            },
          } as unknown as IpcMainInvokeEvent;
          const ipc = new NativeArchiveIpc(owner, () => true);
          await expect(ipc.list(event)).resolves.toEqual({
            entries: [],
            nextCursor: null,
          });
          expect(start).not.toHaveBeenCalled();
          expect(sidecar.nativeAgentGatewayConnection).not.toHaveBeenCalled();
          expect(
            fetch.mock.calls.some(([url]) =>
              String(url).endsWith("/workspaces/list")
            )
          ).toBe(mode === "ordinary");
          for (const [, init] of fetch.mock.calls) {
            const headers = new Headers(init?.headers);
            expect(headers.get("origin")).toBe(origin);
            expect(headers.get("authorization")).toMatch(/^Basic /);
          }
        } finally {
          await native?.close();
          await daemon.stop();
          await fs.rm(base, { recursive: true, force: true });
        }
      }
    );

    it("distinguishes a missing native owner from an unauthorized sender", async () => {
      const { createDesktopArchives } =
        await import("./native-desktop-archives");
      const { NativeArchiveIpc } = await import("./native-archive-ipc");
      const frame = { url: "https://fixture.invalid/desktop/settings" };
      const event = {
        senderFrame: frame,
        sender: {
          mainFrame: frame,
          isDestroyed: () => false,
          isLoadingMainFrame: () => false,
        },
      } as unknown as IpcMainInvokeEvent;
      expect(createDesktopArchives(null, "/resources")).toBeUndefined();
      await expect(
        new NativeArchiveIpc(undefined, () => true).list(event)
      ).rejects.toThrow("native_archive_unavailable");
      await expect(
        new NativeArchiveIpc(undefined, () => false).list(event)
      ).rejects.toThrow("native_archive_settings_required");
    });
  }
);
