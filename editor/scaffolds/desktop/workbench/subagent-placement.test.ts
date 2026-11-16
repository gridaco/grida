import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";
import { SubagentPlacement } from "./subagent-placement";

class Parent implements SubagentPlacement.Parent {
  private view: { subagents: NativeSubagentController | null } = {
    subagents: null,
  };
  private readonly listeners = new Set<() => void>();
  readonly read = () => this.view;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  select(subagents: NativeSubagentController | null): void {
    this.view = { subagents };
    this.emit();
  }
  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

async function fixture() {
  const child = await NativeActivityFixtures.create();
  disposals.push(child.dispose);
  const parent = new Parent();
  const presented: SubagentPlacement.Presentation[] = [];
  const placement = {
    present: vi.fn<SubagentPlacement["present"]>((presentation) => {
      presented.push(presentation);
    }),
    withdraw: vi.fn<SubagentPlacement["withdraw"]>(),
  };
  const stop = SubagentPlacement.connect(parent, placement);
  disposals.push(stop);
  parent.select(child.controller);
  return { child, parent, presented, placement, stop };
}

describe("SubagentPlacement", () => {
  it("presents only requested viewers and reveals again for explicit requests, never live reads", async () => {
    const f = await fixture();
    f.child.controller.parentUpdated();
    f.parent.emit();
    expect(f.presented).toEqual([]);
    f.child.controller.show();
    expect(f.presented).toHaveLength(1);
    expect(f.presented[0]).toMatchObject({
      controller: f.child.controller,
      focus: 1,
    });
    await f.child.controller.list();
    f.parent.emit();
    expect(f.presented).toHaveLength(1);
    await f.child.controller.openChild("done-child");
    expect(f.presented).toHaveLength(2);
    await f.child.controller.readConversation();
    f.child.controller.back();
    expect(f.presented).toHaveLength(2);
    f.child.controller.show();
    expect(f.presented).toHaveLength(3);
    expect(f.presented[2].focus).toBe(3);
  });

  it("dismisses observation without controlling work, and permits a new explicit open", async () => {
    const f = await fixture();
    await f.child.controller.openChild("working-child");
    const first = f.presented[0];
    first.close();
    expect(f.child.controller.read().open).toBe(false);
    expect(f.placement.withdraw).toHaveBeenCalledOnce();
    expect(f.child.calls.stop).toEqual([]);
    expect(f.child.calls.turn).toEqual([]);
    expect(f.child.calls.child).toEqual([]);
    f.parent.emit();
    expect(f.presented).toHaveLength(1);
    f.child.controller.show();
    expect(f.presented).toHaveLength(2);
    first.close();
    expect(f.child.controller.read().open).toBe(true);
    expect(f.placement.withdraw).toHaveBeenCalledOnce();
  });

  it("does not let an obsolete close dismiss a newer request on the same controller", async () => {
    const f = await fixture();
    f.child.controller.show();
    const first = f.presented[0];
    await f.child.controller.openChild("done-child");
    first.close();
    expect(f.child.controller.read()).toMatchObject({
      open: true,
      selected: "done-child",
    });
    expect(f.placement.withdraw).not.toHaveBeenCalled();
    f.presented[1].close();
    expect(f.child.controller.read().open).toBe(false);
  });

  it("withdraws a replaced or detached parent's viewer and ignores its late dismissal", async () => {
    const f = await fixture();
    const next = await NativeActivityFixtures.create();
    disposals.push(next.dispose);
    f.child.controller.show();
    const first = f.presented[0];
    next.controller.show();
    f.parent.select(next.controller);
    expect(f.placement.withdraw).toHaveBeenCalledOnce();
    expect(f.presented.at(-1)?.controller).toBe(next.controller);
    first.close();
    expect(next.controller.read().open).toBe(true);
    f.parent.select(null);
    expect(f.placement.withdraw).toHaveBeenCalledTimes(2);
    const count = f.presented.length;
    next.controller.show();
    expect(f.presented).toHaveLength(count);
  });

  it("withdraws on cleanup without closing work and reconnects an already requested viewer", async () => {
    const f = await fixture();
    f.child.controller.show();
    const first = f.presented[0];
    f.stop();
    f.stop();
    expect(f.placement.withdraw).toHaveBeenCalledOnce();
    expect(f.child.controller.read().open).toBe(true);
    first.close();
    f.child.controller.show();
    expect(f.presented).toHaveLength(1);
    const reconnect = SubagentPlacement.connect(f.parent, f.placement);
    disposals.push(reconnect);
    expect(f.presented).toHaveLength(2);
    expect(f.presented[1].focus).toBe(2);
  });

  it("handles synchronous dismissal while presenting without reopening or cancelling work", async () => {
    const f = await fixture();
    f.placement.present.mockImplementation((presentation) => {
      f.presented.push(presentation);
      presentation.close();
    });
    f.child.controller.show();
    expect(f.presented).toHaveLength(1);
    expect(f.child.controller.read().open).toBe(false);
    expect(f.placement.withdraw).toHaveBeenCalledOnce();
    expect(f.child.calls.stop).toEqual([]);
  });

  it("does not overwrite a reentrant parent replacement during withdrawal", async () => {
    const f = await fixture();
    const next = await NativeActivityFixtures.create();
    const latest = await NativeActivityFixtures.create();
    disposals.push(next.dispose, latest.dispose);
    f.child.controller.show();
    next.controller.show();
    latest.controller.show();
    f.placement.withdraw.mockImplementationOnce(() =>
      f.parent.select(latest.controller)
    );
    f.parent.select(next.controller);
    expect(f.parent.read().subagents).toBe(latest.controller);
    expect(f.presented.at(-1)?.controller).toBe(latest.controller);
    expect(f.presented.map(({ controller }) => controller)).not.toContain(
      next.controller
    );
  });
});
