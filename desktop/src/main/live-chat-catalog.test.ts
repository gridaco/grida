import { mkdir, mkdtemp, realpath, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { NativeAgentProcess } from "./native-agent-process";
import { NativeAgentChat } from "./native-agent-chat";
import { LiveChatCatalog } from "./live-chat-catalog";

const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "grida-chat-catalog-"));
  roots.push(directory);
  const a = { id: "aaaaaaaaaaaaaaaa", cwd: "/a", stateDir: "/private/a" };
  const b = { id: "bbbbbbbbbbbbbbbb", cwd: "/b", stateDir: "/private/b" };
  let locations = [a, b];
  const peers: ReturnType<typeof peer>[] = [];
  function peer(changed: (payload: unknown) => void) {
    const end = Promise.withResolvers<{ code: number | null; signal: null }>();
    return {
      connected: true,
      terminated: end.promise,
      changed,
      exit() {
        this.connected = false;
        end.resolve({ code: 1, signal: null });
      },
      close: vi.fn<() => Promise<void>>(async () => {
        end.resolve({ code: 0, signal: null });
      }),
      request: vi.fn<(method: string, params: unknown) => Promise<unknown>>(
        async (method: string, _params: unknown): Promise<unknown> =>
          method === "session/list"
            ? {
                sessions: [
                  {
                    cwd: a.cwd,
                    sessionId: "sess",
                    title: "A",
                    _meta: {
                      "co.grida/lastMessageAtMs": 42,
                      "co.grida/readState": {
                        unread: true,
                        revision: 4,
                        replyId: "reply",
                      },
                    },
                  },
                ],
                _meta: {
                  "co.grida/runningSessionIds": [],
                  "co.grida/inputNeededSessionIds": [],
                },
              }
            : {}
      ),
    };
  }
  const catalog = new LiveChatCatalog({
    directory,
    locations: async () => locations,
    resolve: async (id) => {
      const match = locations.find((l) => l.id === id);
      if (!match) throw new Error("revoked");
      return { root: match.cwd };
    },
    start: async (_file, notify) => {
      const child = peer(notify);
      peers.push(child);
      return child;
    },
  });
  return {
    catalog,
    peers,
    a,
    b,
    directory,
    revokeA: () => {
      locations = [b];
    },
  };
}

it("shares native observation, filters changes and revalidates the registered roots", async () => {
  const { catalog, peers, a, b, directory, revokeA } = await fixture();
  const global = vi.fn<() => void>(),
    inB = vi.fn<() => void>();
  const stopGlobal = await catalog.observe(undefined, global);
  const stopB = await catalog.observe(b.id, inB);
  expect(peers).toHaveLength(1);
  const agent = peers[0];
  expect(agent.request.mock.calls).toEqual([
    ["_co.grida/catalog/subscribe", {}],
  ]);
  agent.changed({ cwds: [a.cwd] });
  expect(global).toHaveBeenCalledOnce();
  expect(inB).not.toHaveBeenCalled();
  const page = await catalog.list({}, () => {});
  expect(page?.entries[0]).toMatchObject({
    workspaceId: a.id,
    readState: { unread: true, revision: 4, replyId: "reply" },
  });
  await catalog.setReadState(
    a.id,
    "sess",
    { kind: "acknowledge", revision: 4, replyId: "reply" },
    () => {}
  );
  expect(agent.request).toHaveBeenLastCalledWith(
    "_co.grida/session/read-state",
    {
      cwd: "/a",
      sessionId: "sess",
      action: "acknowledge",
      revision: 4,
      replyId: "reply",
    }
  );
  revokeA();
  await catalog.membershipChanged();
  const registry = path.join(directory, "catalog-workspaces.json");
  expect((await stat(registry)).mode & 0o777).toBe(0o600);
  expect(JSON.parse(await readFile(registry, "utf8"))).toEqual({
    workspaces: [{ cwd: "/b", stateDir: "/private/b" }],
  });
  await expect(catalog.list({}, () => {})).rejects.toThrow(
    "native_chat_invalid_protocol_value"
  );
  await expect(
    catalog.setReadState(a.id, "sess", { kind: "markUnread" }, () => {})
  ).rejects.toThrow("revoked");
  stopGlobal?.();
  stopB?.();
  await catalog.reset(true);
});

it("recovers a global page when a previously admitted workspace disappears without a registry event", async () => {
  const { catalog, peers, a, b, revokeA } = await fixture();
  expect((await catalog.list({}, () => {}))?.entries[0].workspaceId).toBe(a.id);
  revokeA();
  const rows = [a, b].map(({ cwd, id }) => ({ cwd, sessionId: id }));
  peers[0].request
    .mockResolvedValueOnce({ sessions: rows })
    .mockResolvedValueOnce({ sessions: [rows[1]] });
  const result = await catalog.list({}, () => {});
  expect(result?.entries.map((row) => row.workspaceId)).toEqual([b.id]);
  await catalog.reset(true);
});

it("keeps independently running chats distinct when two stores contain the same session ID", async () => {
  const { catalog, peers, a, b } = await fixture();
  const stop = await catalog.observe(undefined, () => {});
  const rows = [a, b].map(({ cwd }, index) => ({
    cwd,
    sessionId: "same-id",
    _meta: {
      "co.grida/running": index === 1,
      "co.grida/inputNeeded": index === 0,
    },
  }));
  peers[0].request.mockResolvedValueOnce({ sessions: rows });
  const result = await catalog.list({}, () => {});
  expect(
    result?.entries.map((row) => [
      row.workspaceId,
      row.running,
      row.inputNeeded,
    ])
  ).toEqual([
    [a.id, false, true],
    [b.id, true, false],
  ]);
  peers[0].request.mockResolvedValueOnce({ sessions: [rows[0], rows[0]] });
  await expect(catalog.list({}, () => {})).rejects.toThrow(
    "native_chat_invalid_protocol_value"
  );
  stop?.();
  await catalog.reset(true);
});

it("resubscribes after losing the ACP process and wakes existing observers for a fresh page", async () => {
  const { catalog, peers } = await fixture();
  const changed = vi.fn<() => void>();
  await catalog.observe(undefined, changed);
  vi.useFakeTimers();
  peers[0].exit();
  await vi.advanceTimersByTimeAsync(250);
  expect(peers).toHaveLength(2);
  expect(peers[1].request.mock.calls).toEqual([
    ["_co.grida/catalog/subscribe", {}],
  ]);
  expect(changed).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(peers[1].request).toHaveBeenCalledTimes(1);
  await catalog.reset(true);
});

const resources = process.env.GRIDA_DESKTOP_TEST_NATIVE_RESOURCES;

it.runIf(Boolean(resources))(
  "receives read-state changes from a separate native agent process through the Desktop adapter",
  async () => {
    const dir = await realpath(
      await mkdtemp(path.join(tmpdir(), "grida-live-catalog-"))
    );
    roots.push(dir);
    const cwd = path.join(dir, "work"),
      stateDir = path.join(dir, "state");
    await Promise.all([
      mkdir(cwd, { mode: 0o700 }),
      mkdir(stateDir, { mode: 0o700 }),
    ]);
    const id = "1234567812345678";
    const options = {
      directory: dir,
      locations: async () => [{ id, cwd, stateDir }],
      resolve: async () => ({ root: cwd }),
      start: (manifest: string, changed: (info: unknown) => void) =>
        NativeAgentProcess.startCatalog(resources!, manifest, changed),
    };
    const first = new LiveChatCatalog(options);
    const worker = await NativeAgentChat.start({
      resourcesPath: resources!,
      stateDirectory: stateDir,
      cwd,
      provider: "openai-compatible",
      model: "fixture",
      endpoint: "http://127.0.0.1:1/v1",
    });
    try {
      const chat = await worker.create();
      const session = chat.id;
      const seen = Promise.withResolvers<void>();
      const stop = await first.observe(undefined, () => {
        void first
          .list({}, () => {})
          .then((page) => {
            if (
              page?.entries.some(
                (row) => row.sessionId === session && row.readState?.unread
              )
            )
              seen.resolve();
          }, seen.reject);
      });
      expect(stop).toBeTypeOf("function");
      expect((await first.list({}, () => {}))?.entries).toMatchObject([
        { sessionId: session, readState: { unread: false } },
      ]);
      const external = await NativeAgentProcess.startCatalog(
        resources!,
        path.join(dir, "catalog-workspaces.json"),
        () => {}
      );
      try {
        await external!.request("_co.grida/session/read-state", {
          cwd,
          sessionId: session,
          action: "markUnread",
        });
        await seen.promise;
        expect((await worker.catalogEntry(chat)).readState?.unread).toBe(true);
      } finally {
        await external?.close();
      }
      stop?.();
    } finally {
      await first.reset(true);
      await worker.close();
    }
  },
  15_000
);
