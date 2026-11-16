import { act, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type {
  NativeChatMessage,
  NativeSubagentLifecycleEvent,
} from "@grida/desktop-bridge";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "./native-turn-activity";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";
import "@/app/ui.css";

type Fixture = Awaited<ReturnType<typeof NativeActivityFixtures.create>>;
let fixture: Fixture | undefined;
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  fixture?.dispose();
  document.body.replaceChildren();
});

// Entirely synthetic parent facts; the child observation/navigation is the
// production controller with the existing provider-free activity fixture.
function messages(ordered: boolean): NativeChatMessage[] {
  return [
    {
      messageId: "question",
      turnId: "parent-turn",
      role: "user",
      text: "Compare the approaches.",
    },
    {
      messageId: "before",
      turnId: "parent-turn",
      role: "assistant",
      text: "Before delegation.",
      phase: "progress",
      ...(ordered && { activityOrder: 1 }),
    },
    {
      messageId: "tools",
      turnId: "parent-turn",
      role: "assistant",
      text: "",
      activity: [
        {
          callId: "first-read",
          title: "read_file",
          kind: "read",
          outcome: "succeeded",
          input: { path: "first.ts" },
          ...(ordered && { activityOrder: 3 }),
        },
        {
          callId: "second-read",
          title: "read_file",
          kind: "read",
          outcome: "succeeded",
          input: { path: "second.ts" },
          ...(ordered && { activityOrder: 5 }),
        },
        {
          callId: "third-read",
          title: "read_file",
          kind: "read",
          outcome: "succeeded",
          input: { path: "third.ts" },
          ...(ordered && { activityOrder: 6 }),
        },
      ],
    },
    {
      messageId: "after",
      turnId: "parent-turn",
      role: "assistant",
      text: "Both children finished; I am still checking.",
      phase: "progress",
      ...(ordered && { activityOrder: 9 }),
    },
    {
      messageId: "answer",
      turnId: "parent-turn",
      role: "assistant",
      text: "Final parent answer.",
      phase: "answer",
      ...(ordered && { activityOrder: 10 }),
    },
  ];
}

function events(): NativeSubagentLifecycleEvent[] {
  const fact = (
    childId: string,
    name: string,
    activityOrder: number,
    kind: "started" | "finished"
  ): NativeSubagentLifecycleEvent => ({
    eventId:
      childId === "done-child"
        ? kind === "started"
          ? "review-start"
          : "review-finish"
        : `${childId}-${kind}`,
    childId,
    name,
    kind,
    childTurnId: `${childId}-turn`,
    inputId: `${childId}-input`,
    parentTurnId: "parent-turn",
    activityOrder,
    atMs: NativeActivityFixtures.now + activityOrder,
    ...(kind === "finished" && { status: "succeeded" }),
  });
  return [
    fact("working-child", "Researcher", 2, "started"),
    fact("done-child", "Reviewer", 4, "started"),
    fact("working-child", "Researcher", 7, "finished"),
    fact("done-child", "Reviewer", 8, "finished"),
  ];
}

function Transcript({
  fixture,
  ordered,
  finished,
}: {
  fixture: Fixture;
  ordered: boolean;
  finished: boolean;
}) {
  const view = useSyncExternalStore(
    fixture.controller.subscribe,
    fixture.controller.read,
    fixture.controller.read
  );
  const block = turn_activity.group(
    messages(ordered),
    [
      {
        turnId: "parent-turn",
        status: finished ? "succeeded" : null,
        startedAtMs: 0,
      },
    ],
    finished ? null : { turnId: "parent-turn" }
  )[0];
  if (block.kind !== "turn") throw new Error("fixture_turn_missing");
  return (
    <NativeTurnActivity
      block={block}
      renderMessage={(message) => <p key={message.messageId}>{message.text}</p>}
      subagentEvents={view.events}
      onOpenSubagent={(childId, inputId) =>
        void fixture.controller.openChild(childId, inputId)
      }
    />
  );
}

it("interleaves live child facts, opens their exact child, and replays/reopens without duplicates in Chromium", async () => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  await page.viewport(420, 900);
  fixture = await NativeActivityFixtures.create();
  fixture.data.activity = {
    ...fixture.data.activity,
    events: events().slice(0, 2),
    orderComplete: true,
  };
  fixture.controller.show();
  await vi.waitFor(() =>
    expect(fixture!.controller.read().listing).toBe(false)
  );
  await fixture.controller.list();
  const container = document.createElement("main");
  container.style.cssText =
    "width:388px;padding:16px;background:white;color:#171717";
  document.body.append(container);
  root = createRoot(container);
  const render = (ordered = true, finished = false) =>
    act(async () =>
      root!.render(
        <Transcript fixture={fixture!} ordered={ordered} finished={finished} />
      )
    );
  await render();
  const rows = () =>
    [
      ...container.querySelector('[data-testid="native-turn-activity"]')!
        .children,
    ].map((node) => node.textContent ?? "");
  const check = () => {
    const text = rows();
    expect(text[1]).toContain("Before delegation");
    expect(text[2]).toContain("Researcher started working");
    expect(text[3]).toContain("first.ts");
    expect(text[4]).toContain("Reviewer started working");
    // The two adjacent calls remain grouped; the earlier call is separate.
    expect(text[5]).not.toContain("first.ts");
    expect(text[6]).toContain("Researcher finished");
    expect(text[7]).toContain("Reviewer finished");
    expect(text[8]).toContain("Both children finished");
    expect(text[9]).toBe("Final parent answer.");
    expect(container.querySelectorAll("[data-child-identity]")).toHaveLength(4);
    expect(container.textContent).not.toContain("relative order unavailable");
  };
  await act(async () => {
    fixture!.data.activity = {
      ...fixture!.data.activity,
      events: [...events().reverse(), events()[0]],
    };
    await fixture!.controller.list();
  });
  check();
  await act(async () =>
    page.getByRole("button", { name: /^Reviewer finished/ }).click()
  );
  await vi.waitFor(() =>
    expect(fixture!.controller.read().selected).toBe("done-child")
  );
  expect(fixture.controller.read().input).toBe("done-child-input");
  expect(fixture.calls.conversations.at(-1)).toEqual({
    childId: "done-child",
    before: undefined,
  });
  await act(async () => fixture!.controller.back());
  await act(async () => fixture!.controller.list());
  check();
  await render(true, true);
  expect(container.textContent).not.toContain("Before delegation");
  expect(container.lastElementChild?.lastElementChild?.textContent).toBe(
    "Final parent answer."
  );
  await act(async () =>
    page.getByRole("button", { name: "Worked", exact: true }).click()
  );
  expect(rows()[2]).toContain("Before delegation");
  // A newly mounted/reopened transcript uses retained order, not arrival order.
  act(() => root!.unmount());
  root = createRoot(container);
  await render();
  check();
  await render(false);
  await expect
    .element(
      page.getByRole("region", {
        name: "Subagent events — relative order unavailable",
      })
    )
    .toBeVisible();
  expect(rows().at(-1)).toContain(
    "Subagent events — relative order unavailable"
  );
  expect(container.querySelectorAll("[data-child-identity]")).toHaveLength(4);
});
