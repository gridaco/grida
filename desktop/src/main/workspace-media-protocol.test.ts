import { describe, expect, it, vi } from "vitest";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceRegistry } from "@grida/daemon/server";

const fixtures = vi.hoisted(() => ({
  native: undefined as ReturnType<
    typeof import("./workspace-media-access").nativeWorkspaceMedia
  >,
  children: [] as ChildProcess[],
  handler: undefined as
    | ((request: Request) => Response | Promise<Response>)
    | undefined,
}));

// `workspace-media-protocol.ts` imports `protocol` from electron and the
// main-process sidecar client. The protocol callback is exercised without
// a BrowserWindow while the qualified fixture starts the real native child.
vi.mock("electron", () => ({
  protocol: {
    registerSchemesAsPrivileged: vi.fn<(schemes: unknown[]) => void>(),
    handle: (_scheme: string, handler: typeof fixtures.handler) => {
      fixtures.handler = handler;
    },
  },
}));
vi.mock("./agent-sidecar-client", () => ({
  agentSidecarClient: {
    fetch: vi.fn<(path: string, init?: unknown) => Promise<Response>>(),
    listWorkspaces:
      vi.fn<() => Promise<Awaited<ReturnType<WorkspaceRegistry["list"]>>>>(),
    AgentSidecarNotReadyError: class extends Error {},
  },
}));
vi.mock("./workspace-media-access", () => ({
  nativeWorkspaceMedia: () => fixtures.native,
}));
vi.mock("node:child_process", async (load) => {
  const actual = await load<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => {
      const child = actual.spawn(...args);
      if (
        args[0] === "/usr/bin/sandbox-exec" &&
        args[1]?.includes("workspace-file")
      )
        fixtures.children.push(child);
      return child;
    },
  };
});

import { agentSidecarClient } from "./agent-sidecar-client";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { WorkspaceMediaRegistry } from "./workspace-media-registry";
import {
  handleWorkspaceMediaProtocol,
  parseWorkspaceMediaUrl,
} from "./workspace-media-protocol";

// The `grida-workspace://workspace/<workspaceId>/<relPath>` shape is the seam
// between the preload (which builds it) and this handler (which parses it).
// Containment is re-validated by the selected file owner. These pins cover the parse +
// decode contract — especially that the workspaceId survives verbatim, which is
// WHY both ids live in the path (a host-carried id would be lowercased by
// Chromium's standard-URL canonicalization and stop matching the registry).
describe("parseWorkspaceMediaUrl (#924)", () => {
  it("parses workspaceId from the first path segment and joins the rest as relPath", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws123/dir/pic.png")
    ).toEqual({ workspaceId: "ws123", relPath: "dir/pic.png" });
  });

  it("preserves workspaceId case (path is not host-canonicalized)", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/AbCdEf/x.png")
    ).toEqual({ workspaceId: "AbCdEf", relPath: "x.png" });
  });

  it("percent-decodes each segment", () => {
    expect(
      parseWorkspaceMediaUrl(
        "grida-workspace://workspace/ws/My%20Folder/a%20b.png"
      )
    ).toEqual({ workspaceId: "ws", relPath: "My Folder/a b.png" });
  });

  it("rejects a foreign scheme", () => {
    expect(parseWorkspaceMediaUrl("file:///etc/passwd")).toBeNull();
    expect(parseWorkspaceMediaUrl("https://workspace/ws/x.png")).toBeNull();
  });

  it("rejects a non-`workspace` host or any userinfo/port", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://evil/ws/x.png")
    ).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace:8080/ws/x.png")
    ).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://u:p@workspace/ws/x.png")
    ).toBeNull();
  });

  it("rejects a missing relPath", () => {
    expect(parseWorkspaceMediaUrl("grida-workspace://workspace/ws")).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws/")
    ).toBeNull();
  });

  it("rejects an encoded null byte and a malformed escape", () => {
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws/a%00b.png")
    ).toBeNull();
    expect(
      parseWorkspaceMediaUrl("grida-workspace://workspace/ws/a%zz.png")
    ).toBeNull();
  });

  it("returns null on an unparseable URL", () => {
    expect(parseWorkspaceMediaUrl("not a url")).toBeNull();
  });
});

function registeredHandler() {
  handleWorkspaceMediaProtocol();
  return fixtures.handler!;
}

it("keeps the compatibility Range proxy when native media was never selected", async () => {
  fixtures.native = undefined;
  const handler = registeredHandler();
  const response = new Response("legacy");
  vi.mocked(agentSidecarClient.fetch).mockResolvedValueOnce(response);
  expect(
    await handler(
      new Request("grida-workspace://workspace/example/clip.mp4", {
        headers: { range: "bytes=2-8" },
      })
    )
  ).toBe(response);
  expect(agentSidecarClient.fetch).toHaveBeenLastCalledWith(
    "/workspaces/file?workspace_id=example&rel_path=clip.mp4",
    { method: "GET", headers: { range: "bytes=2-8" } }
  );
  vi.mocked(agentSidecarClient.fetch).mockClear();
});

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

describe.runIf(
  Boolean(resources) &&
    process.platform === "darwin" &&
    process.arch === "arm64"
)("registered native workspace media", () => {
  it("uses the built reader for 200, 206, 416 and MIME without admitting a saved entry", async () => {
    const fixture = await workspaceFixture();
    try {
      const saved = await fixture.compatibility.open(fixture.workspace);
      await fs.writeFile(
        path.join(fixture.workspace, "clip.mp4"),
        "0123456789"
      );
      expect((await fixture.request(saved.id)).status).toBe(403);
      expect(fixtures.children).toHaveLength(0);
      const admitted = await fixture.reopen();
      for (const [range, status, contentRange, bytes] of [
        [undefined, 200, null, "0123456789"],
        ["bytes=3-6", 206, "bytes 3-6/10", "3456"],
        ["bytes=-2", 206, "bytes 8-9/10", "89"],
        ["bytes=40-80", 416, "bytes */10", ""],
      ] as const) {
        const result = await fixture.request(admitted.id, range);
        expect(result.status).toBe(status);
        expect(result.headers.get("accept-ranges")).toBe("bytes");
        expect(result.headers.get("content-range")).toBe(contentRange);
        expect(result.headers.get("content-type")).toBe(
          status === 416 ? null : "video/mp4"
        );
        expect(result.headers.get("cache-control")).toBe(
          status === 416 ? null : "no-store"
        );
        expect(result.headers.get("content-length")).toBe(
          status === 416 ? null : String(bytes.length)
        );
        expect(await result.text()).toBe(bytes);
      }
      expect(fixtures.children).toHaveLength(4);
      expect(agentSidecarClient.fetch).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });

  it("denies protected aliases and same-path replacement until a trusted reopen", async () => {
    const fixture = await workspaceFixture();
    try {
      const admitted = await fixture.reopen();
      await fs.writeFile(path.join(fixture.workspace, "clip.mp4"), "old");
      const outside = path.join(fixture.protected, "hidden.mp4");
      await fs.writeFile(outside, "protected");
      await fs.symlink(outside, path.join(fixture.workspace, "alias.mp4"));
      const result = await fixture.handler(
        new Request(`grida-workspace://workspace/${admitted.id}/alias.mp4`)
      );
      expect(result.status).toBe(403);
      await fs.rename(fixture.workspace, fixture.workspace + "-old");
      await fs.mkdir(fixture.workspace);
      await fs.writeFile(
        path.join(fixture.workspace, "clip.mp4"),
        "replacement"
      );
      const changed = await fixture.request(admitted.id);
      expect(changed.status).toBe(403);
      expect(await changed.text()).toBe("workspace_media_registration_changed");
      expect(fixtures.children).toHaveLength(1);
      expect(agentSidecarClient.fetch).not.toHaveBeenCalled();
      expect((await fixture.reopen()).id).toBe(admitted.id);
      expect(await (await fixture.request(admitted.id)).text()).toBe(
        "replacement"
      );
    } finally {
      await fixture.close();
    }
  });

  it("distinguishes missing files from unavailable workers", async () => {
    const fixture = await workspaceFixture();
    try {
      const admitted = await fixture.reopen();
      const result = await fixture.request(admitted.id);
      expect(result.status).toBe(404);
      expect(await result.text()).toBe("workspace_media_file_unavailable");
      expect(agentSidecarClient.fetch).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });

  it("releases the exact native worker when the request or body is cancelled", async () => {
    const fixture = await workspaceFixture();
    try {
      const admitted = await fixture.reopen();
      const file = await fs.open(path.join(fixture.workspace, "clip.mp4"), "w");
      await file.truncate(64 * 1024 * 1024);
      await file.close();
      for (const abortRequest of [true, false]) {
        const controller = new AbortController();
        const result = await fixture.request(
          admitted.id,
          undefined,
          controller.signal
        );
        expect(result.status).toBe(200);
        const child = fixtures.children.at(-1)!;
        const exited = once(child, "close");
        if (abortRequest) controller.abort();
        else await result.body!.cancel();
        await expect(exited).resolves.toEqual([null, "SIGKILL"]);
      }
    } finally {
      await fixture.close();
    }
  });

  it("bounds concurrent workers and readmits after actual child exit", async () => {
    const fixture = await workspaceFixture();
    try {
      const admitted = await fixture.reopen();
      const file = await fs.open(path.join(fixture.workspace, "clip.mp4"), "w");
      await file.truncate(64 * 1024 * 1024);
      await file.close();
      const active = await Promise.all(
        Array.from({ length: 8 }, () => fixture.request(admitted.id))
      );
      expect(active.map(({ status }) => status)).toEqual(Array(8).fill(200));
      const full = await fixture.request(admitted.id);
      expect(full.status).toBe(503);
      expect(await full.text()).toBe("workspace_media_worker_capacity");
      expect(fixtures.children).toHaveLength(8);
      await active[0].body!.cancel();
      const next = await fixture.request(admitted.id, "bytes=1-2");
      expect(next.status).toBe(206);
      expect(await next.arrayBuffer()).toEqual(new ArrayBuffer(2));
      await Promise.all(active.slice(1).map((result) => result.body!.cancel()));
      expect(agentSidecarClient.fetch).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  });
});

async function workspaceFixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-workspace-media-"))
  );
  const workspace = path.join(root, "workspace");
  const storage = path.join(root, "registry");
  const protectedRoot = path.join(root, "protected");
  for (const directory of [workspace, storage, protectedRoot]) {
    await fs.mkdir(directory, { mode: 0o700 });
  }
  const compatibility = new WorkspaceRegistry(storage);
  const registry = new WorkspaceMediaRegistry([
    storage,
    protectedRoot,
    path.join(root, "missing"),
  ]);
  const workers = new WorkspaceFileWorkers(resources!);
  fixtures.native = { registry, workers };
  fixtures.children.length = 0;
  vi.mocked(agentSidecarClient.listWorkspaces).mockImplementation(() =>
    compatibility.list()
  );
  vi.mocked(agentSidecarClient.fetch).mockClear();
  const handler = registeredHandler();
  return {
    workspace,
    protected: protectedRoot,
    compatibility,
    handler,
    reopen: () =>
      registry.register(workspace, (canonical) =>
        compatibility.open(canonical)
      ),
    request: (id: string, range?: string, signal?: AbortSignal) =>
      handler(
        new Request(`grida-workspace://workspace/${id}/clip.mp4`, {
          headers: range ? { range } : undefined,
          signal,
        })
      ),
    close: async () => {
      workers.close();
      fixtures.native = undefined;
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}
