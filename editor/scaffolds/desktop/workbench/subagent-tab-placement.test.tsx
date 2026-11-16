import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";
import { EditorGroup } from "./editor-group";
import { SubagentTabPlacement } from "./subagent-tab-placement";
import { WorkbenchPanels } from "./workbench-panels";
import { WorkbenchTab } from "./workbench-tab";
import type { SubagentPlacement } from "./subagent-placement";

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

async function fixture() {
  const activity = await NativeActivityFixtures.create();
  disposals.push(activity.dispose);
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  const panels = new WorkbenchPanels(group);
  const placement = new SubagentTabPlacement(panels);
  const close = vi.fn<() => void>(() => {
    if (activity.controller.read().open) activity.controller.toggle();
  });
  const presentation = (focus = 1): SubagentPlacement.Presentation => ({
    controller: activity.controller,
    focus,
    close,
  });
  const tab = WorkbenchTab.panel(SubagentTabPlacement.panel);
  return { ...activity, group, panels, placement, close, presentation, tab };
}

describe("SubagentTabPlacement", () => {
  it("opens a single focused content tab with the real read-only conversation", async () => {
    const f = await fixture();
    const document = WorkbenchTab.file("design.svg");
    f.group.open(document);
    expect(f.group.getSnapshot().tabs).toEqual([document]);
    await f.controller.openChild("done-child");
    f.placement.present(f.presentation());
    expect(f.group.getSnapshot()).toEqual({
      tabs: [document, f.tab],
      active: f.tab,
    });
    const panel = f.panels.getSnapshot().get(SubagentTabPlacement.panel)!;
    expect(panel.title).toBe("Subagents");
    const html = renderToStaticMarkup(<>{panel.content}</>);
    expect(html).toContain('data-testid="subagent-tab-content"');
    expect(html).toContain("The second approach preserves the contract.");
    expect(html).toContain("Back to subagents");
    expect(html).not.toContain("Assign work");
    expect(html).not.toContain("Stop subagent");
    expect(html).not.toContain("<textarea");
  });

  it("reuses the tab and reveals it only for another explicit presentation request", async () => {
    const f = await fixture();
    f.controller.show();
    f.placement.present(f.presentation());
    const document = WorkbenchTab.file("design.svg");
    f.group.open(document);
    f.placement.present(f.presentation());
    expect(f.group.getSnapshot().active).toBe(document);
    f.placement.present(f.presentation(2));
    expect(f.group.getSnapshot()).toEqual({
      tabs: [f.tab, document],
      active: f.tab,
    });
    expect(f.close).not.toHaveBeenCalled();
  });

  it("closes only observation when its tab is dismissed and allows the same view to reopen", async () => {
    const f = await fixture();
    await f.controller.openChild("working-child");
    const mutations = [
      vi.spyOn(f.client, "createSubagent"),
      vi.spyOn(f.client, "assignSubagent"),
      vi.spyOn(f.client, "stopSubagent"),
      vi.spyOn(f.client, "controlSubagentTurn"),
      vi.spyOn(f.client, "controlSubagentChild"),
    ];
    f.placement.present(f.presentation());
    const document = WorkbenchTab.file("design.svg");
    f.group.open(document);
    f.group.close(f.tab);
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.controller.read().open).toBe(false);
    expect(f.panels.getSnapshot().size).toBe(0);
    expect(f.group.getSnapshot()).toEqual({
      tabs: [document],
      active: document,
    });
    f.group.reopenClosed();
    expect(f.group.getSnapshot().tabs).toEqual([document]);
    await f.controller.openChild("working-child");
    f.placement.present(f.presentation(2));
    expect(f.group.getSnapshot().active).toBe(f.tab);
    for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
  });

  it("withdraws on parent removal without dismissing work or touching document tabs", async () => {
    const f = await fixture();
    const document = WorkbenchTab.file("design.svg");
    f.group.open(document);
    f.controller.show();
    f.placement.present(f.presentation());
    f.placement.withdraw();
    expect(f.group.getSnapshot()).toEqual({
      tabs: [document],
      active: document,
    });
    expect(f.panels.getSnapshot().size).toBe(0);
    expect(f.close).not.toHaveBeenCalled();
  });

  it("ignores an old tab dismissal after its presentation has been replaced", async () => {
    const f = await fixture();
    const callbacks: (() => void)[] = [];
    const panels = {
      show: vi.fn<WorkbenchPanels["show"]>((_id, _panel, dismissed) => {
        callbacks.push(dismissed);
      }),
      reveal: vi.fn<WorkbenchPanels["reveal"]>(),
      withdraw: vi.fn<WorkbenchPanels["withdraw"]>(),
    } satisfies Pick<WorkbenchPanels, "show" | "reveal" | "withdraw">;
    const placement = new SubagentTabPlacement(panels);
    const first = f.presentation();
    const second = { ...f.presentation(2), close: vi.fn<() => void>() };
    placement.present(first);
    placement.present(second);
    callbacks[0]();
    expect(first.close).not.toHaveBeenCalled();
    expect(second.close).not.toHaveBeenCalled();
    callbacks[1]();
    expect(second.close).toHaveBeenCalledOnce();
  });
});
