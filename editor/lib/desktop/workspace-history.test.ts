import { describe, expect, it } from "vitest";
import { WorkspaceHistory } from "./workspace-history";

const ORIGIN = "https://grida.co";
const HOME = `${ORIGIN}/desktop/welcome`;
const WORKSPACE = `${ORIGIN}/desktop/workspace?id=a`;

function history(
  urls: readonly (string | null)[],
  active: number,
  otherDocument?: number
) {
  const entries = urls.map(
    (url, index) =>
      ({
        index,
        key: `entry-${index}`,
        url,
        sameDocument: index !== otherDocument,
      }) as NavigationHistoryEntry
  );
  return { currentEntry: entries[active], entries: () => entries };
}

describe("workspace history", () => {
  it("identifies Home after Back even when the native snapshot only has booleans", () => {
    const current = history([WORKSPACE, HOME], 0);
    const native = { can_go_back: false, can_go_forward: true };
    expect(WorkspaceHistory.project(current, ORIGIN, native)).toEqual({
      ...native,
      forward_destination: "home",
    });
    expect(WorkspaceHistory.target(current, ORIGIN, 1)).toEqual({
      key: "entry-1",
      destination: "home",
    });
  });

  it("identifies Welcome after setup and separates startup restoration", () => {
    const current = history(
      [
        `${HOME}?onboardingWorkspace=a`,
        WORKSPACE,
        `${HOME}?startup=restore-last-workspace`,
      ],
      1
    );
    const native = { can_go_back: true, can_go_forward: true };
    expect(WorkspaceHistory.project(current, ORIGIN, native)).toEqual({
      ...native,
      back_destination: "home",
    });
  });

  it("keeps arrows to Welcome presets distinct from the Home shortcut", () => {
    const current = history(
      [`${HOME}?preset=slides`, WORKSPACE, `${HOME}?preset=workflows`],
      1
    );
    const native = { can_go_back: true, can_go_forward: true };
    expect(WorkspaceHistory.project(current, ORIGIN, native)).toEqual(native);
    expect(WorkspaceHistory.target(current, ORIGIN, -1)).toEqual({
      key: "entry-0",
    });
    expect(WorkspaceHistory.target(current, ORIGIN, 1)).toEqual({
      key: "entry-2",
    });
  });

  it("leaves other documents to native history and ignores foreign entries", () => {
    const current = history(
      [null, WORKSPACE, "https://elsewhere.example/desktop/welcome"],
      1,
      0
    );
    const native = {
      can_go_back: true,
      back_destination: "home" as const,
      can_go_forward: false,
    };
    expect(WorkspaceHistory.project(current, ORIGIN, native)).toEqual(native);
    expect(WorkspaceHistory.target(current, ORIGIN, -1)).toBeUndefined();
    expect(WorkspaceHistory.target(current, ORIGIN, 1)).toBeUndefined();
  });
});
