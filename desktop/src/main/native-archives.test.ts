// GRIDA-SEC-004 — opaque catalog access never loads or starts a model.
import { describe, expect, it, vi } from "vitest";
import { NativeArchives } from "./native-archives";
import type { Workspace } from "@grida/daemon/server";

const a: Workspace = {
  id: "a",
  name: "First",
  root: "/projects/first",
  opened_at: 1,
  pinned: false,
};
const b: Workspace = {
  id: "b",
  name: "Second",
  root: "/projects/second",
  opened_at: 2,
  pinned: false,
};
const page = (sessionId: string, revision = 3) => ({
  entries: [{ sessionId, revision, title: "Saved work" }],
  nextCursor: null,
});
function fixture() {
  const execute = vi
    .fn<(request: unknown) => Promise<unknown>>()
    .mockResolvedValue(page("closed-chat"));
  const active = vi
    .fn<
      (id: string) => null | {
        archiveCatalog: (cursor: string | null) => Promise<unknown>;
        unarchiveCatalog: (session: string, revision: number) => Promise<void>;
      }
    >()
    .mockReturnValue(null);
  const resolve = vi
    .fn<(id: string) => Promise<{ root: string }>>()
    .mockImplementation(async (id) => ({ root: id === "a" ? a.root : b.root }));
  const owner = new NativeArchives({
    resourcesPath: "/resources",
    workspaces: async () => [b, a],
    resolve,
    directory: async (id) => `/private/${id}`,
    active,
    execute,
  });
  return { owner, execute, active, resolve };
}

describe("Settings archives", () => {
  it.each([false, true])(
    "preserves retained activity using the active owner: %s",
    async (open) => {
      const { owner, execute, active } = fixture();
      const atMs = 1_800_000_000_000;
      const dated = {
        entries: [{ ...page("saved").entries[0], lastActivityAtMs: atMs }],
        nextCursor: null,
      };
      if (open)
        active.mockReturnValue({
          archiveCatalog: async () => dated,
          unarchiveCatalog: async () => {},
        });
      else execute.mockResolvedValue(dated);
      const result = await owner.list();
      expect(result.entries[0]).toMatchObject({ lastActivityAtMs: atMs });
      expect(result.entries[0].id).not.toBe("saved");
      expect(execute).toHaveBeenCalledTimes(open ? 0 : 1);
    }
  );

  it.each([null, -1, 0.5, "today", 8_640_000_000_000_001])(
    "refuses an invalid retained activity timestamp: %s",
    async (lastActivityAtMs) => {
      const { owner, execute } = fixture();
      execute.mockResolvedValue({
        entries: [{ ...page("saved").entries[0], lastActivityAtMs }],
        nextCursor: null,
      });
      const result = await owner.list();
      expect(result.entries).toEqual([]);
      expect(result.unavailableWorkspaces).toEqual(["First", "Second"]);
    }
  );

  it("lists across workspace stores in bounded pages and restores only issued metadata", async () => {
    const { owner, execute } = fixture();
    const first = await owner.list();
    expect(first.entries[0]).toMatchObject({
      workspace: "First",
      title: "Saved work",
      revision: 3,
    });
    expect(first.entries[0].id).not.toBe("closed-chat");
    expect(JSON.stringify(first)).not.toContain("/private");
    expect(first.nextCursor).toBeTypeOf("string");
    const second = await owner.list(first.nextCursor);
    expect(second.entries[0].workspace).toBe("Second");
    expect(second.nextCursor).toBeNull();
    execute.mockResolvedValueOnce({ restored: true });
    await owner.unarchive(first.entries[0].id, 3);
    expect(execute).toHaveBeenLastCalledWith({
      directory: "/private/a",
      root: a.root,
      cursor: null,
      restore: { session: "closed-chat", revision: 3 },
    });
    await expect(owner.unarchive(first.entries[0].id, 3)).rejects.toThrow(
      "handle_invalid"
    );
  });

  it("uses the existing native owner when the store is open, without another process", async () => {
    const { owner, active, execute } = fixture();
    const unarchiveCatalog = vi
      .fn<(session: string, revision: number) => Promise<void>>()
      .mockResolvedValue();
    const archiveCatalog = vi
      .fn<(cursor: string | null) => Promise<unknown>>()
      .mockResolvedValue(page("active-chat"));
    active.mockReturnValue({ archiveCatalog, unarchiveCatalog });
    const result = await owner.list();
    await owner.unarchive(result.entries[0].id, 3);
    expect(archiveCatalog).toHaveBeenCalledExactlyOnceWith(null);
    expect(unarchiveCatalog).toHaveBeenCalledExactlyOnceWith("active-chat", 3);
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects forged handles, cursors and stale revisions before mutation", async () => {
    const { owner, execute } = fixture();
    await expect(owner.list("invented")).rejects.toThrow("cursor_invalid");
    await expect(owner.unarchive("closed-chat", 3)).rejects.toThrow(
      "handle_invalid"
    );
    const result = await owner.list();
    execute.mockClear();
    await expect(owner.unarchive(result.entries[0].id, 4)).rejects.toThrow(
      "handle_invalid"
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("rechecks workspace admission and reports unavailable folders without hiding other archives", async () => {
    const { owner, resolve, execute } = fixture();
    resolve.mockRejectedValueOnce(new Error("workspace unavailable"));
    const result = await owner.list();
    expect(result.unavailableWorkspaces).toEqual(["First"]);
    expect(result.entries[0].workspace).toBe("Second");
    resolve.mockResolvedValueOnce({ root: "/replacement" });
    execute.mockClear();
    await expect(owner.unarchive(result.entries[0].id, 3)).rejects.toThrow(
      "workspace_changed"
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not write after Settings admission is revoked while resolving the store", async () => {
    const { owner, execute, resolve } = fixture();
    const result = await owner.list();
    let admitted = true;
    resolve.mockImplementationOnce(async () => {
      admitted = false;
      return { root: a.root };
    });
    execute.mockClear();
    await expect(
      owner.unarchive(result.entries[0].id, 3, () => {
        if (!admitted) throw new Error("revoked");
      })
    ).rejects.toThrow("revoked");
    expect(execute).not.toHaveBeenCalled();
  });
});
