import { describe, expect, it } from "vitest";
import { WorkspaceFileReloadGuard } from "./workspace-file-reload-guard";

describe("WorkspaceFileReloadGuard", () => {
  it("accepts the newest reload when the editor stayed unchanged", () => {
    const guard = new WorkspaceFileReloadGuard();
    const request = guard.begin(4);

    expect(
      guard.accepts(request, { contentVersion: 4, writeInFlight: false })
    ).toBe(true);
  });

  it("rejects an older read that finishes after a newer request", () => {
    const guard = new WorkspaceFileReloadGuard();
    const older = guard.begin(4);
    const newer = guard.begin(4);

    expect(
      guard.accepts(older, { contentVersion: 4, writeInFlight: false })
    ).toBe(false);
    expect(
      guard.accepts(newer, { contentVersion: 4, writeInFlight: false })
    ).toBe(true);
  });

  it("rejects a result when the user edited during the read", () => {
    const guard = new WorkspaceFileReloadGuard();
    const request = guard.begin(4);

    expect(
      guard.accepts(request, { contentVersion: 5, writeInFlight: false })
    ).toBe(false);
  });

  it("rejects a result while a workspace write is in flight", () => {
    const guard = new WorkspaceFileReloadGuard();
    const request = guard.begin(4);

    expect(
      guard.accepts(request, { contentVersion: 4, writeInFlight: true })
    ).toBe(false);
  });

  it("does not load or commit a rejected projection", () => {
    const guard = new WorkspaceFileReloadGuard();
    const stale = guard.begin(4);
    guard.begin(4);
    const effects: string[] = [];

    expect(
      guard.apply(
        stale,
        { contentVersion: 4, writeInFlight: false },
        {
          content: "red projection",
          commit: () => effects.push("commit"),
          discard: () => effects.push("discard"),
        },
        () => effects.push("load")
      )
    ).toBe(false);
    expect(effects).toEqual(["discard"]);
  });

  it("loads accepted content before committing its projection state", () => {
    const guard = new WorkspaceFileReloadGuard();
    const request = guard.begin(4);
    const effects: string[] = [];

    expect(
      guard.apply(
        request,
        { contentVersion: 4, writeInFlight: false },
        {
          content: "red projection",
          commit: () => effects.push("commit"),
        },
        (content) => effects.push(`load:${content}`)
      )
    ).toBe(true);
    expect(effects).toEqual(["load:red projection", "commit"]);
  });

  it("discards projection state when loading accepted content throws", () => {
    const guard = new WorkspaceFileReloadGuard();
    const request = guard.begin(4);
    const effects: string[] = [];

    expect(() =>
      guard.apply(
        request,
        { contentVersion: 4, writeInFlight: false },
        {
          content: "bad projection",
          commit: () => effects.push("commit"),
          discard: () => effects.push("discard"),
        },
        () => {
          throw new Error("load failed");
        }
      )
    ).toThrow("load failed");
    expect(effects).toEqual(["discard"]);
  });
});
