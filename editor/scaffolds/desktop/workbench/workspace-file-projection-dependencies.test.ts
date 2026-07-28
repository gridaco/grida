import { describe, expect, it } from "vitest";
import { WorkspaceFileRevision } from "./workspace-file-revision";
import { WorkspaceFileProjectionDependencies } from "./workspace-file-projection-dependencies";

const changed = (relPath: string) =>
  [{ kind: "changed", rel_path: relPath }] as const;

describe("WorkspaceFileProjectionDependencies", () => {
  it("watches the bundle during discovery, then narrows to committed paths", () => {
    const dependencies = new WorkspaceFileProjectionDependencies("deck.canvas");
    const request = dependencies.begin();

    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/new.png")
      )
    ).toBe(true);

    expect(
      dependencies.commit(request, ["deck.canvas/assets/current.png"])
    ).toBe(true);
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/new.png")
      )
    ).toBe(false);
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/current.png")
      )
    ).toBe(true);
  });

  it("stays bundle-wide until every overlapping preparation settles", () => {
    const dependencies = new WorkspaceFileProjectionDependencies("deck.canvas");
    const older = dependencies.begin();
    const newer = dependencies.begin();
    dependencies.commit(newer, ["deck.canvas/assets/new.png"]);

    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/other.png")
      )
    ).toBe(true);

    dependencies.discard(older);
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/other.png")
      )
    ).toBe(false);
  });

  it("covers a new dependency while transitioning from an older graph", () => {
    const dependencies = new WorkspaceFileProjectionDependencies("deck.canvas");
    const initial = dependencies.begin();
    dependencies.commit(initial, ["deck.canvas/assets/a.png"]);

    const transition = dependencies.begin();
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/b.png")
      )
    ).toBe(true);

    dependencies.commit(transition, ["deck.canvas/assets/b.png"]);
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/a.png")
      )
    ).toBe(false);
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/b.png")
      )
    ).toBe(true);
  });

  it("does not replace committed paths from a discarded preparation", () => {
    const dependencies = new WorkspaceFileProjectionDependencies("deck.canvas");
    const accepted = dependencies.begin();
    dependencies.commit(accepted, ["deck.canvas/assets/a.png"]);
    const rejected = dependencies.begin();
    dependencies.discard(rejected);

    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/a.png")
      )
    ).toBe(true);
    expect(
      WorkspaceFileRevision.changed(
        dependencies.scope(),
        changed("deck.canvas/assets/b.png")
      )
    ).toBe(false);
  });
});
