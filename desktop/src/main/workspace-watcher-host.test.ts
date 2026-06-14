import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  coalesceChanges,
  isValidSubscriptionId,
  toRelativeChange,
  WorkspaceWatchRegistry,
} from "./workspace-watcher-host";

describe("isValidSubscriptionId", () => {
  it("accepts UUID-shaped tokens and rejects everything else", () => {
    expect(isValidSubscriptionId("0b8d7c2e-91c4-4b6e-a9f4-2f6a4a9d1c0e")).toBe(
      true
    );
    expect(isValidSubscriptionId("")).toBe(false);
    expect(isValidSubscriptionId("a".repeat(65))).toBe(false);
    expect(isValidSubscriptionId("../etc/passwd")).toBe(false);
    expect(isValidSubscriptionId(42)).toBe(false);
  });
});

describe("toRelativeChange", () => {
  const root = "/work/space";

  it("maps native event types to coarse kinds with a workspace-relative path", () => {
    expect(
      toRelativeChange(root, { type: "create", path: "/work/space/a.svg" })
    ).toEqual({ kind: "added", rel_path: "a.svg" });
    expect(
      toRelativeChange(root, { type: "update", path: "/work/space/dir/b.svg" })
    ).toEqual({ kind: "changed", rel_path: "dir/b.svg" });
    expect(
      toRelativeChange(root, { type: "delete", path: "/work/space/dir/c.svg" })
    ).toEqual({ kind: "deleted", rel_path: "dir/c.svg" });
  });

  it("drops the root itself and any path that escapes the root", () => {
    expect(
      toRelativeChange(root, { type: "update", path: "/work/space" })
    ).toBe(null);
    expect(
      toRelativeChange(root, { type: "update", path: "/work/other/secret" })
    ).toBe(null);
    expect(
      toRelativeChange(root, { type: "update", path: "/work/spacex/x" })
    ).toBe(null);
  });
});

describe("coalesceChanges", () => {
  it("keeps one event per path with the most recent kind winning", () => {
    expect(
      coalesceChanges([
        { kind: "changed", rel_path: "a" },
        { kind: "changed", rel_path: "a" },
      ])
    ).toEqual([{ kind: "changed", rel_path: "a" }]);

    // create then delete within one window → the file is gone
    expect(
      coalesceChanges([
        { kind: "added", rel_path: "tmp" },
        { kind: "deleted", rel_path: "tmp" },
      ])
    ).toEqual([{ kind: "deleted", rel_path: "tmp" }]);

    // distinct paths preserved
    expect(
      coalesceChanges([
        { kind: "added", rel_path: "a" },
        { kind: "changed", rel_path: "b" },
      ])
    ).toEqual([
      { kind: "added", rel_path: "a" },
      { kind: "changed", rel_path: "b" },
    ]);
  });
});

/**
 * The ref-counting protocol: one OS watch per root shared across every
 * subscriber, so the host knows to start the watch on the first
 * subscriber and dispose it on the last — across windows.
 */
describe("WorkspaceWatchRegistry", () => {
  const owner = { id: 1 };
  const other = { id: 2 };
  const root = "/work/space";

  it("first subscriber for a root signals firstForRoot; a second does not", () => {
    const reg = new WorkspaceWatchRegistry<object>(8);
    expect(reg.add("a", owner, root, "w1").firstForRoot).toBe(true);
    expect(reg.add("b", other, root, "w1").firstForRoot).toBe(false);
  });

  it("rejects a duplicate id and enforces the per-owner cap", () => {
    const reg = new WorkspaceWatchRegistry<object>(2);
    reg.add("a", owner, root, "w1");
    expect(() => reg.add("a", owner, "/other", "w2")).toThrow(/already exists/);
    reg.add("b", owner, "/other", "w2");
    expect(() => reg.add("c", owner, "/third", "w3")).toThrow(/too many/);
    // a different window is unaffected
    reg.add("c", other, "/third", "w3");
  });

  it("only the last subscriber leaving a root signals lastForRoot", () => {
    const reg = new WorkspaceWatchRegistry<object>(8);
    reg.add("a", owner, root, "w1");
    reg.add("b", other, root, "w1");
    expect(reg.remove("a")).toEqual({ root, lastForRoot: false });
    expect(reg.remove("b")).toEqual({ root, lastForRoot: true });
    // unknown id is idempotent (renderer unmount races host cleanup)
    expect(reg.remove("a")).toBeNull();
    expect(reg.remove("nope")).toBeNull();
  });

  it("subscribersOfRoot returns every live subscriber's id + owner", () => {
    const reg = new WorkspaceWatchRegistry<object>(8);
    reg.add("a", owner, root, "w1");
    reg.add("b", other, root, "w1");
    expect(reg.subscribersOfRoot(root)).toEqual([
      { id: "a", owner },
      { id: "b", owner: other },
    ]);
    expect(reg.subscribersOfRoot("/unwatched")).toEqual([]);
  });

  it("removeAllFor disposes only roots that lost their last subscriber", () => {
    const reg = new WorkspaceWatchRegistry<object>(8);
    reg.add("a", owner, root, "w1"); // shared root
    reg.add("b", other, root, "w1"); // shared root, other window
    reg.add("c", owner, "/solo", "w2"); // owner-only root
    // owner's window closes: /solo loses its last subscriber, the shared
    // root still has `other`, so it is NOT disposed.
    expect(reg.removeAllFor(owner).sort()).toEqual(["/solo"]);
    expect(reg.hasSubscribersForRoot(root)).toBe(true);
    expect(reg.hasSubscribersForRoot("/solo")).toBe(false);
    expect(reg.remove("b")).toEqual({ root, lastForRoot: true });
  });
});

// GRIDA-SEC-004 anti-drift: every workspace-watch IPC channel must be
// registered through `guarded(` — the sender-frame gate that keeps the
// surface reachable only from editor-origin `/desktop/*` frames. A bare
// `ipcMain.handle(IPC_CHANNELS.WORKSPACE_...` ships it without the gate.
describe("workspace-watch IPC registration", () => {
  it("registers every workspace-watch invoke channel via guarded()", () => {
    const source = fs.readFileSync(
      new URL("./ipc-handlers.ts", import.meta.url),
      "utf8"
    );
    for (const channel of [
      "WORKSPACE_SUBSCRIBE_CHANGES",
      "WORKSPACE_UNSUBSCRIBE_CHANGES",
    ]) {
      expect(source).toMatch(
        new RegExp(`guarded\\(\\s*IPC_CHANNELS.${channel}`)
      );
      expect(source).not.toMatch(
        new RegExp(`ipcMain.handle\\(\\s*IPC_CHANNELS.${channel}`)
      );
    }
  });
});
