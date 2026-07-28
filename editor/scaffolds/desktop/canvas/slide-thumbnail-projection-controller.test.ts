import { describe, expect, it } from "vitest";
import { SlideThumbnailProjectionController } from "./slide-thumbnail-projection-controller";

describe("SlideThumbnailProjectionController", () => {
  it("refreshes a declared dependency but ignores unrelated bundle writes", () => {
    const controller = new SlideThumbnailProjectionController("deck.canvas");
    expect(controller.reconcile(["slides/001.svg"]).load).toEqual([
      "slides/001.svg",
    ]);
    const request = controller.begin("slides/001.svg")!;
    expect(request.relPath).toBe("deck.canvas/slides/001.svg");
    expect(controller.complete(request, ["deck.canvas/assets/fill.png"])).toBe(
      true
    );

    expect(
      controller.changed([
        { kind: "changed", rel_path: "deck.canvas/.canvas.json" },
      ])
    ).toEqual([]);
    expect(
      controller.changed([
        { kind: "changed", rel_path: "deck.canvas/assets/fill.png" },
      ])
    ).toEqual(["slides/001.svg"]);
  });

  it("restarts an initial projection for any concurrent bundle change", () => {
    const controller = new SlideThumbnailProjectionController("deck.canvas");
    controller.reconcile(["slides/001.svg"]);
    controller.begin("slides/001.svg");

    expect(
      controller.changed([
        { kind: "added", rel_path: "deck.canvas/assets/fill.png" },
      ])
    ).toEqual(["slides/001.svg"]);
  });

  it("rejects an older completion after a newer read begins", () => {
    const controller = new SlideThumbnailProjectionController("deck.canvas");
    controller.reconcile(["slides/001.svg"]);
    const older = controller.begin("slides/001.svg")!;
    const newer = controller.begin("slides/001.svg")!;

    expect(controller.complete(newer, ["deck.canvas/assets/red.png"])).toBe(
      true
    );
    expect(controller.complete(older, ["deck.canvas/assets/black.png"])).toBe(
      false
    );
    expect(
      controller.changed([
        { kind: "changed", rel_path: "deck.canvas/assets/black.png" },
      ])
    ).toEqual([]);
    expect(
      controller.changed([
        { kind: "changed", rel_path: "deck.canvas/assets/red.png" },
      ])
    ).toEqual(["slides/001.svg"]);
  });

  it("rejects a completion after removal and same-src re-add", () => {
    const controller = new SlideThumbnailProjectionController("deck.canvas");
    controller.reconcile(["slides/001.svg"]);
    const removedRequest = controller.begin("slides/001.svg")!;
    expect(controller.reconcile([]).removed).toEqual(["slides/001.svg"]);
    expect(controller.reconcile(["slides/001.svg"]).load).toEqual([
      "slides/001.svg",
    ]);
    const currentRequest = controller.begin("slides/001.svg")!;

    expect(controller.complete(removedRequest, [])).toBe(false);
    expect(controller.complete(currentRequest, [])).toBe(true);
  });

  it("invalidates in-flight work when the workspace context resets", () => {
    const controller = new SlideThumbnailProjectionController("old.canvas");
    controller.reconcile(["001.svg"]);
    const old = controller.begin("001.svg")!;

    controller.reset("new.canvas");
    expect(controller.reconcile(["001.svg"]).load).toEqual(["001.svg"]);
    expect(controller.complete(old, [])).toBe(false);
    expect(controller.begin("001.svg")?.relPath).toBe("new.canvas/001.svg");
  });
});
