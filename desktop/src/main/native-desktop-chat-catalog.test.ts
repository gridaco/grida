import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { NativeAgentProcess } from "./native-agent-process";
import * as closedCatalog from "./native-chat-catalog";
import { createDesktopChatCatalog } from "./native-desktop-chat-catalog";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";

const { listWorkspaces, startCatalog } = vi.hoisted(() => ({
  listWorkspaces: vi.fn<NativeWorkspaceCatalog["list"]>(),
  startCatalog:
    vi.fn<
      () => Promise<Pick<
        NativeAgentProcess,
        "connected" | "terminated" | "close" | "request"
      > | null>
    >(),
}));
vi.mock("./services-sidecar-client", () => ({
  servicesSidecarClient: {
    listWorkspaces,
    onWorkspaceMembershipChange: () => {},
  },
}));
vi.mock("./native-agent-process", () => ({
  NativeAgentProcess: { startCatalog },
}));

afterEach(() => vi.restoreAllMocks());

it.skipIf(process.platform === "win32").each(["live", "legacy"])(
  "%s catalog keeps healthy chats accessible when another registered folder disappears",
  async (host) => {
    const base = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "grida-catalog-admission-"))
    );
    const browserData = path.join(base, "browser");
    const a = path.join(base, "a"),
      b = path.join(base, "b");
    let catalog: ReturnType<typeof createDesktopChatCatalog>;
    try {
      for (const dir of [browserData, a, b])
        await fs.mkdir(dir, { mode: 0o700 });
      const registry = new NativeWorkspaceCatalog({
        browserData,
        projectsRoot: path.join(base, "projects"),
        protectedPaths: [],
      });
      const unavailable = await registry.openSelected(a);
      const healthy = await registry.openSelected(b);
      listWorkspaces.mockImplementation(() => registry.list());
      const page = (cwd: string) => ({
        sessions:
          cwd === b ? [{ cwd, sessionId: "chat", title: "Healthy" }] : [],
        _meta: { "co.grida/runningSessionIds": [] },
      });
      vi.spyOn(closedCatalog, "readClosedChatCatalog").mockImplementation(
        async (_resources, _directory, cwd) => page(cwd)
      );
      startCatalog.mockResolvedValue(
        host === "live"
          ? {
              connected: true,
              terminated: new Promise<
                Awaited<NativeAgentProcess["terminated"]>
              >(() => {}),
              close: async () => {},
              request: async () => page(b),
            }
          : null
      );
      catalog = createDesktopChatCatalog(
        {
          catalogRegistryDirectory: browserData,
          catalogGeneration: 0,
          catalogLocation: async (id) => {
            const { root } = await registry.fileGrant(id);
            return { id, cwd: root, stateDir: path.join(browserData, id) };
          },
          catalogWorkspace: (id) => registry.fileGrant(id),
          withCatalogStore: async (id, _root, read) =>
            read(
              null,
              path.join(browserData, id),
              (await registry.fileGrant(id)).root
            ),
        },
        base
      )!;
      const manifest = path.join(browserData, "catalog-workspaces.json");
      const readRoots = async () =>
        (
          JSON.parse(await fs.readFile(manifest, "utf8")).workspaces as {
            cwd: string;
          }[]
        ).map((row) => row.cwd);
      await catalog.list({ workspaceId: healthy.id }, () => {});
      expect(await readRoots()).toContain(a);
      await fs.rename(a, a + "-unmounted");
      await catalog.live.membershipChanged();
      const expected = [{ workspaceId: healthy.id, sessionId: "chat" }];
      expect(
        (await catalog.list({ workspaceId: healthy.id }, () => {})).entries
      ).toMatchObject(expected);
      expect((await catalog.list({}, () => {})).entries).toMatchObject(
        expected
      );
      const admitted = await readRoots();
      expect(admitted).toContain(b);
      expect(admitted).not.toContain(a);
      await expect(
        catalog.list({ workspaceId: unavailable.id }, () => {})
      ).rejects.toThrow("workspace_not_registered");

      // A failed registry read revokes the whole projection.
      listWorkspaces.mockRejectedValue(new Error("workspace_catalog_invalid"));
      await catalog.live.membershipChanged();
      await expect(catalog.list({}, () => {})).rejects.toThrow(
        "workspace_catalog_invalid"
      );
      expect(await readRoots()).toEqual([]);
    } finally {
      await catalog?.live.reset(true);
      await fs.rm(base, { recursive: true, force: true });
    }
  }
);
