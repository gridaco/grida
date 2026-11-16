import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { NativeSubagentActivityPanel } from "./native-agent-activity";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";
import { NativeTurnActivity } from "./native-turn-activity";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import "@/app/ui.css";

type Fixture = Awaited<ReturnType<typeof NativeActivityFixtures.create>>;
const mounted: { root: Root; fixture: Fixture }[] = [];

afterEach(() => {
  for (const { root, fixture } of mounted.splice(0)) {
    act(() => root.unmount());
    fixture.dispose();
  }
  document.body.replaceChildren();
});

function ParentChat({ fixture, width }: { fixture: Fixture; width: number }) {
  const { open: activityOpen } = useSyncExternalStore(
    fixture.controller.subscribe,
    fixture.controller.read,
    fixture.controller.read
  );
  const block = turn_activity
    .group(
      [
        {
          messageId: "parent-question",
          role: "user",
          text: "Compare both solutions.",
          turnId: "parent-turn",
        },
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
          text: "The parent result remains here.",
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
      aria-label="Fixture parent chat"
      style={{
        position: "relative",
        width,
        height: 700,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid #e5e5e5",
        background: "white",
        color: "#171717",
      }}
    >
      <header
        style={{
          height: 40,
          flexShrink: 0,
          padding: "0 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #e5e5e5",
        }}
      >
        <h1 style={{ fontSize: 13, fontWeight: 500 }}>Parent chat</h1>
        <NativeSubagentActivityPanel subagents={fixture.controller} />
      </header>
      <div
        inert={activityOpen}
        style={{
          minHeight: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <main style={{ overflowY: "auto", padding: 12, flex: 1 }}>
          <NativeTurnActivity
            block={block}
            renderMessage={(message) => (
              <p key={message.messageId}>{message.text}</p>
            )}
            subagentEvents={fixture.data.activity.events}
            onOpenSubagent={(childId, inputId) =>
              void fixture.controller.openChild(childId, inputId)
            }
          />
        </main>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 12,
            fontSize: 12,
          }}
        >
          Parent draft
          <textarea
            defaultValue="My unsent parent draft"
            style={{
              height: 72,
              resize: "none",
              border: "1px solid #d4d4d4",
              borderRadius: 12,
              padding: 8,
            }}
          />
        </label>
      </div>
    </section>
  );
}

async function setup(width: number) {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(width + 32, 744);
  document.body.style.margin = "16px";
  document.body.style.fontFamily = "Arial, sans-serif";
  const fixture = await NativeActivityFixtures.create();
  fixture.data.activity = {
    ...fixture.data.activity,
    events: fixture.data.activity.events.map((event) => ({
      ...event,
      inputId: `${event.childId}-input`,
    })),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, fixture });
  await act(async () =>
    root.render(<ParentChat fixture={fixture} width={width} />)
  );
  return {
    fixture,
    container,
    draft: container.querySelector<HTMLTextAreaElement>("textarea")!,
  };
}

async function click(name: string | RegExp) {
  await act(async () =>
    page.getByRole("button", { name, exact: typeof name === "string" }).click()
  );
}

async function screenshot(name: string, width: number) {
  await page.screenshot({
    path: `../../../../output/playwright/desktop-activity/${name}-${width}.png`,
    element: page.getByRole("region", { name: "Fixture parent chat" }),
  });
}

describe("parent-local agent activity in Chromium", () => {
  it.each([320, 420])(
    "navigates read-only subagent list, conversation and parent events at %spx without losing the parent draft",
    async (width) => {
      const { fixture, container, draft } = await setup(width);
      const mutations = [
        vi.spyOn(fixture.client, "createSubagent"),
        vi.spyOn(fixture.client, "assignSubagent"),
        vi.spyOn(fixture.client, "stopSubagent"),
        vi.spyOn(fixture.client, "controlSubagentTurn"),
        vi.spyOn(fixture.client, "controlSubagentChild"),
      ];
      const originalDraft = draft.value;
      expect(
        container.querySelector('[aria-label="Open subagents"]')
      ).toBeNull();
      await click(/Worked for/);
      await click(/Reviewer finished/);
      await expect
        .poll(
          () =>
            container.querySelector(
              '[data-testid="native-subagent-conversation"]'
            )?.textContent
        )
        .toContain("The second approach preserves the contract.");
      expect(fixture.controller.read().selected).toBe("done-child");
      expect(container.textContent).toContain("captured-model · High");
      expect(container.textContent).not.toContain("New named subagent");
      await screenshot("conversation", width);
      await click("Back to subagents");
      await expect.poll(() => fixture.controller.read().detail).toBe(false);
      await expect
        .poll(
          () =>
            container.querySelector('[aria-label="Active subagents"]')
              ?.textContent
        )
        .toContain("Researcher");
      expect(
        container.querySelector('[aria-label="Completed subagents"]')
          ?.textContent
      ).toContain("Reviewer");
      await screenshot("list", width);
      await click(/Researcher/);
      await expect
        .poll(() => container.textContent)
        .toContain("I am comparing the evidence.");
      const subagents = container.querySelector(
        '[data-testid="native-subagent-activity"]'
      )!;
      expect(
        subagents.querySelector("input, textarea, select, form")
      ).toBeNull();
      for (const button of subagents.querySelectorAll("button")) {
        const name =
          button.getAttribute("aria-label") ?? button.textContent?.trim();
        expect(["Back to subagents", "Copy"]).toContain(name);
      }
      await click("Back to subagents");
      expect(
        container.querySelector('[data-testid="native-agent-activity"]')
          ?.textContent
      ).not.toContain("Processes");
      await click("Close subagents");
      expect(
        container.querySelector('[data-testid="native-agent-activity"]')
      ).toBeNull();
      expect(draft.isConnected).toBe(true);
      expect(draft.value).toBe(originalDraft);
      await click(/Reviewer finished/);
      await expect
        .poll(() => fixture.controller.read().selected)
        .toBe("done-child");
      await expect
        .poll(
          () =>
            container.querySelector(
              '[data-testid="native-subagent-conversation"]'
            )?.textContent
        )
        .toContain("The second approach preserves the contract.");
      expect(draft.value).toBe(originalDraft);
      expect(container.textContent).not.toContain("View changes");
      expect(container.textContent).not.toContain("Undo");
      for (const mutation of mutations) expect(mutation).not.toHaveBeenCalled();
    }
  );

  it("keeps Done history discoverable at zero Active and returns keyboard focus on Escape", async () => {
    const { fixture, container, draft } = await setup(420);
    fixture.data.activity = {
      ...fixture.data.activity,
      children: fixture.data.activity.children.map((child) => ({
        ...child,
        status: "succeeded",
        section: "done",
      })),
      counts: { active: 0, done: 2, complete: true },
    };
    expect(container.querySelector('[aria-label="Open subagents"]')).toBeNull();
    await click(/Worked for/);
    const origin = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Reviewer finished")
    )!;
    await click(/Reviewer finished/);
    await click("Back to subagents");
    expect(document.activeElement).toBe(
      container.querySelector('[data-testid="native-agent-activity"]')
    );
    await act(async () => fixture.controller.list());
    await expect
      .poll(() => container.textContent)
      .toContain("No active subagents.");
    expect(container.textContent).toContain("Done · 2");
    expect(draft.closest("[inert]")).not.toBeNull();
    await screenshot("zero-active", 420);
    await act(async () => userEvent.keyboard("{Escape}"));
    await expect
      .poll(() =>
        container.querySelector('[data-testid="native-agent-activity"]')
      )
      .toBeNull();
    expect(document.activeElement).toBe(origin);
    expect(draft.closest("[inert]")).toBeNull();
    expect(draft.value).toBe("My unsent parent draft");
  });
});
