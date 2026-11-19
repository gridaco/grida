import { describe, expect, it, vi } from "vitest";
import { NativeChatCatalog } from "./native-chat-catalog";

type ReadCatalog = ConstructorParameters<typeof NativeChatCatalog>[0]["read"];

const a = { id: "000000000000000a", root: "/project/a" };
const b = { id: "000000000000000b", root: "/project/b" };
const row = (sessionId: string, at?: number, title = sessionId) => ({
  sessionId,
  title,
  _meta: at == null ? {} : { "co.grida/lastMessageAtMs": at },
});
const page = (
  root: string,
  sessions: ReturnType<typeof row>[],
  nextCursor: string | null = null
) => ({
  sessions: sessions.map((session) => ({ ...session, cwd: root })),
  nextCursor,
  _meta: {
    "co.grida/runningSessionIds": [],
    "co.grida/inputNeededSessionIds": [],
  },
});

describe("Desktop chat discovery", () => {
  it("merges before limiting, continues partial native pages and reopens the same ordering", async () => {
    const aRows = [row("a6", 6), row("common", 4), row("undated")];
    const bRows = [
      row("b5", 5),
      row("common", 4),
      row("b3", 3),
      row("undated"),
    ];
    const workspaces = async () => [b, a];
    const resolve = async (id: string) => (id === a.id ? a : b);
    const read = vi.fn<ReadCatalog>(async (workspace, cursor) => {
      const rows = workspace.id === a.id ? aRows : bRows;
      // Deliberately use native pages shorter than the public request.
      return cursor
        ? page(workspace.root, rows.slice(2))
        : page(workspace.root, rows.slice(0, 2), "native-next");
    });
    const catalog = new NativeChatCatalog({ workspaces, resolve, read });
    const first = await catalog.list({ limit: 3 });
    expect(first.entries.map((x) => [x.workspaceId, x.sessionId])).toEqual([
      [a.id, "a6"],
      [b.id, "b5"],
      [a.id, "common"],
    ]);
    bRows[1] = row("common", 4, "Renamed while browsing");
    const second = await catalog.list({ cursor: first.nextCursor, limit: 2 });
    expect(second.entries.map((x) => x.title)).toEqual([
      "Renamed while browsing",
      "b3",
    ]);
    const last = await catalog.list({ cursor: second.nextCursor });
    expect(
      last.entries.map((x) => [x.workspaceId, x.sessionId, x.lastMessageAtMs])
    ).toEqual([
      [a.id, "undated", null],
      [b.id, "undated", null],
    ]);
    expect(last.nextCursor).toBeNull();
    expect(
      await new NativeChatCatalog({ workspaces, resolve, read }).list({
        limit: 1,
      })
    ).toMatchObject({
      entries: [expect.objectContaining({ sessionId: "a6" })],
    });
    read.mockClear();
    expect(
      (await catalog.list({ workspaceId: b.id })).entries.map(
        (x) => x.sessionId
      )
    ).toEqual(["b5", "common", "b3", "undated"]);
    expect(read.mock.calls.every(([workspace]) => workspace.id === b.id)).toBe(
      true
    );
    await expect(
      catalog.list({ cursor: first.nextCursor, workspaceId: a.id })
    ).rejects.toThrow("cursor_invalid");
  });

  it("withdraws the result if a workspace is removed during a read", async () => {
    let admitted = true;
    const catalog = new NativeChatCatalog({
      workspaces: async () => [a],
      resolve: async () => {
        if (!admitted) throw new Error("workspace_removed");
        return a;
      },
      read: async () => {
        admitted = false;
        return page(a.root, [row("unavailable", 5)]);
      },
    });
    await expect(catalog.list({})).rejects.toThrow("workspace_removed");
  });

  it("continues past new arrivals and expires the cursor before a long catch-up scan", async () => {
    let newest = 2;
    const read = vi.fn<ReadCatalog>(async (_workspace, cursor) => {
      const first = cursor ? Number(cursor) - 1 : newest;
      const times = Array.from(
        { length: Math.min(first, 32) },
        (_, i) => first - i
      );
      return page(
        a.root,
        times.map((time) => row(String(time), time)),
        first > 32 ? String(times.at(-1)) : null
      );
    });
    const catalog = new NativeChatCatalog({
      workspaces: async () => [a],
      resolve: async () => a,
      read,
    });
    const { nextCursor } = await catalog.list({ limit: 1 });
    newest = 3;
    expect(
      (await catalog.list({ cursor: nextCursor })).entries.map(
        (entry) => entry.sessionId
      )
    ).toEqual(["1"]);
    newest = 102;
    read.mockClear();
    await expect(catalog.list({ cursor: nextCursor })).rejects.toThrow(
      "cursor_invalid"
    );
    expect(read).toHaveBeenCalledTimes(3);
    expect((await catalog.list({ limit: 1 })).entries[0].sessionId).toBe("102");
  });

  it("rejects an earlier account's cursor and an in-flight account switch", async () => {
    let generation = 1;
    const read = vi.fn<ReadCatalog>(async () =>
      page(a.root, [row("newer", 2), row("older", 1)])
    );
    const catalog = new NativeChatCatalog({
      workspaces: async () => [a],
      resolve: async () => a,
      generation: () => generation,
      read,
    });
    const { nextCursor } = await catalog.list({ limit: 1 });
    generation++;
    await expect(catalog.list({ cursor: nextCursor })).rejects.toThrow(
      "cursor_invalid"
    );
    expect(read).toHaveBeenCalledTimes(1);
    read.mockImplementationOnce(async () => {
      generation++;
      return page(a.root, [row("private", 2)]);
    });
    await expect(catalog.list({})).rejects.toThrow("scope_changed");
  });
});
