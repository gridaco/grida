import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { NativeSubagentController } from "@/lib/agent-chat/native-subagent-controller";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { EditorGroup } from "./editor-group";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";
import { NativeTurnActivity } from "./native-turn-activity";
import { SubagentPlacement } from "./subagent-placement";
import { SubagentTabPlacement } from "./subagent-tab-placement";
import { WorkbenchPanels } from "./workbench-panels";
import { WorkbenchPanelTab } from "./workbench-panel-tab";
import { WorkbenchTab } from "./workbench-tab";
import "@/app/ui.css";

type Fixture = Awaited<ReturnType<typeof NativeActivityFixtures.create>>;
const mounted: { root: Root; stop: () => void; fixture: Fixture }[] = [];
afterEach(() => {
  for (const value of mounted.splice(0)) {
    act(() => value.root.unmount());
    value.stop();
    value.fixture.dispose();
  }
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

class Parent implements SubagentPlacement.Parent {
  private readonly listeners = new Set<() => void>();
  private view: { subagents: NativeSubagentController | null };
  constructor(subagents: NativeSubagentController) {
    this.view = { subagents };
  }
  readonly read = () => this.view;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  disconnect(): void {
    this.view = { subagents: null };
    for (const listener of this.listeners) listener();
  }
}

function Workbench({
  fixture,
  parent,
  group,
  panels,
}: {
  fixture: Fixture;
  parent: Parent;
  group: EditorGroup;
  panels: WorkbenchPanels;
}) {
  const { tabs, active } = useSyncExternalStore(
    group.subscribe,
    group.getSnapshot,
    group.getSnapshot
  );
  const content = useSyncExternalStore(
    panels.subscribe,
    panels.getSnapshot,
    panels.getSnapshot
  );
  const block = turn_activity
    .group(
      [
        {
          messageId: "parent-progress",
          role: "assistant",
          phase: "progress",
          text: "I asked Reviewer to compare the options.",
          turnId: "parent-turn",
        },
        {
          messageId: "parent-answer",
          role: "assistant",
          phase: "answer",
          text: "The parent answer stays here.",
          turnId: "parent-turn",
        },
      ],
      [
        {
          turnId: "parent-turn",
          status: "succeeded",
          startedAtMs: NativeActivityFixtures.now - 400_000,
          settledAtMs: NativeActivityFixtures.now - 59_000,
        },
      ],
      null
    )
    .find((entry) => entry.kind === "turn");
  if (!block || block.kind !== "turn") throw new Error("fixture_turn_missing");
  return (
    <section
      aria-label="Fixture workbench"
      className="flex h-[640px] w-[960px] border bg-background text-foreground"
    >
      <aside
        aria-label="Parent chat"
        className="flex w-80 shrink-0 flex-col border-r p-3"
      >
        <NativeTurnActivity
          block={block}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={fixture.data.activity.events}
          onOpenSubagent={(childId, inputId) =>
            void parent.read().subagents?.openChild(childId, inputId)
          }
        />
        <label className="mt-auto flex flex-col gap-2 text-xs">
          Parent draft
          <textarea
            defaultValue="Unsent parent draft"
            className="min-h-20 rounded-xl border p-2"
          />
        </label>
      </aside>
      <main aria-label="Main content" className="flex min-w-0 flex-1 flex-col">
        <div
          role="tablist"
          aria-label="Content tabs"
          className="flex h-10 shrink-0 items-center gap-1 border-b px-2"
        >
          {tabs.map((tab) => {
            const target = WorkbenchTab.parse(tab);
            const panel =
              target.kind === "panel" ? content.get(target.id) : undefined;
            return (
              <WorkbenchPanelTab
                key={tab}
                title={panel?.title ?? "design.svg"}
                icon={panel?.icon}
                active={active === tab}
                onSelect={() => group.activate(tab)}
                onClose={() => group.close(tab)}
              />
            );
          })}
        </div>
        <div className="min-h-0 flex-1">
          {tabs.map((tab) => {
            const target = WorkbenchTab.parse(tab);
            return (
              <div key={tab} hidden={active !== tab} className="h-full">
                {target.kind === "panel" ? (
                  content.get(target.id)?.content
                ) : (
                  <p className="p-4">Workspace document</p>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </section>
  );
}

async function setup() {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(1000, 680);
  document.body.style.margin = "16px";
  const fixture = await NativeActivityFixtures.create();
  fixture.data.activity = {
    ...fixture.data.activity,
    events: fixture.data.activity.events.map((event) => ({
      ...event,
      inputId: `${event.childId}-input`,
    })),
  };
  const group = new EditorGroup({ reopenable: WorkbenchTab.reopenable });
  const panels = new WorkbenchPanels(group);
  const parent = new Parent(fixture.controller);
  const stop = SubagentPlacement.connect(
    parent,
    new SubagentTabPlacement(panels)
  );
  group.open(WorkbenchTab.file("design.svg"));
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  mounted.push({ root, stop, fixture });
  await act(async () =>
    root.render(
      <Workbench
        fixture={fixture}
        parent={parent}
        group={group}
        panels={panels}
      />
    )
  );
  return {
    fixture,
    parent,
    group,
    panels,
    element,
    draft: element.querySelector("textarea")!,
  };
}

async function click(name: string | RegExp) {
  await act(async () =>
    page.getByRole("button", { name, exact: typeof name === "string" }).click()
  );
}

async function openFromTranscript() {
  await click(/Worked for/);
  await click(/Reviewer finished/);
}

describe("Subagent content tab in Chromium", () => {
  it("follows growing transcripts and lets the reader scroll back before returning to the bottom", async () => {
    const f = await setup();
    const update = (lines: number) => {
      const conversation = f.fixture.data.conversations.get("done-child")!;
      f.fixture.data.conversations.set("done-child", {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.role === "assistant"
            ? {
                ...message,
                text: "Streaming transcript paragraph.\n\n".repeat(lines),
              }
            : message
        ),
      });
    };
    update(40);
    await openFromTranscript();
    const log = f.element.querySelector('[role="log"]')!;
    const header = f.element.querySelector(
      '[data-testid="native-subagent-activity"] > header'
    )!;
    expect(log.contains(header)).toBe(false);
    const headerTop = header.getBoundingClientRect().top;
    const scroll = log.firstElementChild as HTMLElement;
    const distance = () =>
      scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
    await expect
      .poll(() => scroll.scrollHeight > scroll.clientHeight)
      .toBe(true);
    await expect.poll(distance).toBeLessThan(5);
    update(65);
    await act(async () => f.fixture.controller.readConversation());
    await expect.poll(distance).toBeLessThan(5);
    scroll.scrollTop = 0;
    scroll.dispatchEvent(new Event("scroll"));
    await expect.poll(() => scroll.scrollTop).toBe(0);
    expect(header.getBoundingClientRect().top).toBe(headerTop);
    await expect
      .element(page.getByRole("button", { name: "Scroll to bottom" }))
      .toBeVisible();
    update(80);
    await act(async () => f.fixture.controller.readConversation());
    await expect.poll(() => scroll.scrollTop).toBe(0);
    await click("Scroll to bottom");
    await expect.poll(distance).toBeLessThan(5);
    expect(header.getBoundingClientRect().top).toBe(headerTop);
  });

  it("opens from the actual transcript indicator, leaves the parent usable and reveals one tab again on request", async () => {
    const f = await setup();
    const mutations = [
      vi.spyOn(f.fixture.client, "createSubagent"),
      vi.spyOn(f.fixture.client, "assignSubagent"),
      vi.spyOn(f.fixture.client, "stopSubagent"),
      vi.spyOn(f.fixture.client, "controlSubagentTurn"),
      vi.spyOn(f.fixture.client, "controlSubagentChild"),
    ];
    expect(f.panels.getSnapshot().size).toBe(0);
    await openFromTranscript();
    await expect
      .poll(
        () =>
          f.element.querySelector('[data-testid="subagent-tab-content"]')
            ?.textContent
      )
      .toContain("The second approach preserves the contract.");
    expect(f.group.getSnapshot().active).toBe(
      WorkbenchTab.panel(SubagentTabPlacement.panel)
    );
    expect(f.draft.closest("[inert]")).toBeNull();
    expect(
      f.element.querySelector('[data-testid="native-agent-activity"]')
    ).toBeNull();
    await act(async () =>
      userEvent.fill(f.draft, "Parent draft remains editable")
    );
    expect(f.draft.value).toBe("Parent draft remains editable");
    await act(async () =>
      page.getByRole("tab", { name: /^design\.svg/ }).click()
    );
    await act(async () => f.fixture.controller.readConversation());
    expect(f.group.getSnapshot().active).toBe(WorkbenchTab.file("design.svg"));
    await click(/Reviewer finished/);
    expect(f.group.getSnapshot().active).toBe(
      WorkbenchTab.panel(SubagentTabPlacement.panel)
    );
    expect(f.group.getSnapshot().tabs).toHaveLength(2);
    await click("Back to subagents");
    await expect
      .poll(
        () =>
          f.element.querySelector('[data-testid="subagent-tab-content"]')
            ?.textContent
      )
      .toContain("Active · 1");
    await click(/Researcher/);
    await expect
      .poll(
        () =>
          f.element.querySelector('[data-testid="subagent-tab-content"]')
            ?.textContent
      )
      .toContain("I am comparing the evidence.");
    const content = f.element.querySelector(
      '[data-testid="subagent-tab-content"]'
    )!;
    expect(content.querySelector("textarea, input, form, select")).toBeNull();
    await click("Close Subagents");
    expect(f.fixture.controller.read().open).toBe(false);
    expect(f.panels.getSnapshot().size).toBe(0);
    expect(f.group.getSnapshot().active).toBe(WorkbenchTab.file("design.svg"));
    expect(f.draft.value).toBe("Parent draft remains editable");
    await click(/Reviewer finished/);
    await expect.poll(() => f.panels.getSnapshot().size).toBe(1);
    for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
  });

  it("withdraws the requested subagent tab when the parent detaches while keeping document content", async () => {
    const f = await setup();
    await openFromTranscript();
    await expect.poll(() => f.panels.getSnapshot().size).toBe(1);
    await act(async () => f.parent.disconnect());
    expect(f.panels.getSnapshot().size).toBe(0);
    expect(f.group.getSnapshot()).toEqual({
      tabs: [WorkbenchTab.file("design.svg")],
      active: WorkbenchTab.file("design.svg"),
    });
    expect(f.element.textContent).toContain("Workspace document");
    expect(f.draft.value).toBe("Unsent parent draft");
    expect(f.fixture.calls.stop).toEqual([]);
    expect(f.fixture.calls.turn).toEqual([]);
    expect(f.fixture.calls.child).toEqual([]);
  });
});
