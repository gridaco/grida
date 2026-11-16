import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  NativeSubagentActivityPanel,
  NativeSubagentActivity,
} from "./native-agent-activity";
import { NativeBackgroundProcessList } from "./native-background-processes";
import { NativeSubagentIdentity } from "./native-subagent-identity";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});
async function fixture(modern = true) {
  const value = await NativeActivityFixtures.create(modern);
  disposals.push(value.dispose);
  return value;
}

describe("Native agent activity presentation", () => {
  it("keeps completed history visible with an exact zero-active empty state", async () => {
    const f = await fixture();
    f.data.activity = {
      ...f.data.activity,
      children: f.data.activity.children.map((child) => ({
        ...child,
        section: "done",
        status: "succeeded",
      })),
      counts: { active: 0, done: 2, complete: true },
    };
    f.controller.show();
    await f.controller.list();
    await Promise.resolve();
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html).toContain("Active · 0");
    expect(html).toContain("No active subagents.");
    expect(html).toContain("Done · 2");
    expect(html).toContain("Reviewer");
    expect(html).toContain("1m ago");
    expect(html).not.toContain("New named subagent");
    expect(html).not.toContain("<form");
  });

  it("shows the path to active work outside the loaded page and marks lower-bound counts", async () => {
    const f = await fixture();
    f.data.activity = {
      ...f.data.activity,
      children: f.data.activity.children.map((child) => ({
        ...child,
        section: "done",
        status: "succeeded",
      })),
      counts: { active: 1, done: 33, complete: false },
      nextAfterChildId: "next-page",
    };
    f.controller.show();
    await f.controller.list();
    await Promise.resolve();
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html).toContain("Active · ≥1");
    expect(html).toContain("More active subagents may be on later pages.");
    expect(html).toContain("Show more subagents");
    expect(html).not.toContain("No active subagents.");
    expect(html).toContain("Counts with ≥ are lower bounds.");
  });

  it("renders the actual child conversation and captured metadata rather than the bounded result preview", async () => {
    const f = await fixture();
    await f.controller.openChild("done-child");
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html).toContain("Back to subagents");
    expect(html.split("captured-model · High")).toHaveLength(2);
    expect(html).toContain("Compare the two approaches.");
    expect(html).toContain("The second approach preserves the contract.");
    expect(html).not.toContain("A bounded result preview.");
    expect(html).not.toContain("A live conversation is unavailable");
    expect(html).not.toContain("View changes");
    expect(html).not.toContain("Undo");
    expect(html).not.toContain("Assign work");
    expect(html).not.toContain("<textarea");
    const turn = f.data.conversations.get("done-child")!.turns[0];
    expect(html).toContain(
      `dateTime="${new Date(turn.startedAtMs).toISOString()}"`
    );
    expect(html).toContain(
      `dateTime="${new Date(turn.settledAtMs!).toISOString()}"`
    );
    expect(html).not.toContain(new Date(turn.startedAtMs).toLocaleString());
  });

  it("keeps historical turn settings visible when they differ from the header", async () => {
    const f = await fixture();
    const conversation = f.data.conversations.get("done-child")!;
    f.data.conversations.set("done-child", {
      ...conversation,
      turns: conversation.turns.map((turn) => ({
        ...turn,
        execution: { model: "earlier-model", effort: "low" },
      })),
    });
    await f.controller.openChild("done-child");
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html.split("captured-model · High")).toHaveLength(2);
    expect(html).toContain("earlier-model · Low");
  });

  it("marks refreshing cached totals when a freshly observed child contradicts a zero count", async () => {
    const f = await fixture();
    f.data.activity = {
      ...f.data.activity,
      counts: { active: 0, done: 1, complete: true },
    };
    f.controller.show();
    await Promise.resolve();
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html).toContain("Active · ≥1");
    expect(html).toContain("Updating totals…");
    expect(html).not.toContain("No active subagents.");
  });

  it.each([true, false])(
    "keeps running child activity read-only even when the host offers controls (modern: %s)",
    async (modern) => {
      const f = await fixture(modern);
      await f.controller.openChild("working-child");
      expect(f.controller.read().observation?.stopObservationId).toBeTruthy();
      expect(f.controller.turnControls).toContain("pause");
      expect(f.controller.turnControls).toContain("steer");
      expect(f.controller.childControls).toContain("message");
      const html = renderToStaticMarkup(
        <NativeSubagentActivity controller={f.controller} />
      );
      expect(html).toContain(
        modern ? "I am comparing the evidence." : "Assignment preview"
      );
      expect(html).toContain("Back to subagents");
      expect(html).not.toContain("Stop subagent");
      expect(html).not.toContain("Pause subagent");
      expect(html).not.toContain("Steer subagent");
      expect(html).not.toContain("Send information");
      expect(html).not.toContain("Resume subagent");
      expect(html).not.toContain("Withdraw selected assignment");
      expect(html).not.toContain("Assign work");
      expect(html).not.toContain("Subagent controls");
      expect(html).not.toMatch(/<(form|input|textarea|select)\b/);
      if (modern) expect(html.match(/<time\b/g)).toHaveLength(1);
    }
  );

  it("describes the older-host inspection fallback without calling it a transcript", async () => {
    const f = await fixture(false);
    await f.controller.openChild("done-child");
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html).toContain("A live conversation is unavailable on this host.");
    expect(html).toContain("Assignment preview");
    expect(html).toContain("A bounded result preview.");
    expect(html).not.toContain("captured-model");
  });

  it("keeps ended processes accessible when none are running and handles an empty list", async () => {
    const f = await fixture();
    f.processes.receive(
      f.data.processes.map((process) => ({
        ...process,
        state: "ended",
        exitCode: 0,
      }))
    );
    const ended = renderToStaticMarkup(
      <NativeBackgroundProcessList controller={f.processes} />
    );
    expect(ended).toContain("pnpm dev");
    expect(ended).toContain("exited 0");
    expect(ended).not.toContain("Stop all");
    f.processes.receive([]);
    const empty = renderToStaticMarkup(
      <NativeBackgroundProcessList controller={f.processes} />
    );
    expect(empty).toContain("No processes yet.");
  });

  it("keeps the closed viewer absent until a transcript request without a header shortcut", async () => {
    const f = await fixture();
    const html = renderToStaticMarkup(
      <NativeSubagentActivityPanel subagents={f.controller} />
    );
    expect(html).toBe("");
    await f.controller.openChild("done-child");
    const opened = renderToStaticMarkup(
      <NativeSubagentActivityPanel subagents={f.controller} />
    );
    expect(opened).toContain("The second approach preserves the contract.");
    expect(opened).not.toContain("Open subagents");
    expect(opened).not.toContain("No processes yet.");
  });

  it("uses a deterministic visual identity independent of the current name or list position", () => {
    const first = renderToStaticMarkup(
      <NativeSubagentIdentity childId="stable-child" />
    );
    const again = renderToStaticMarkup(
      <NativeSubagentIdentity childId="stable-child" />
    );
    const other = renderToStaticMarkup(
      <NativeSubagentIdentity childId="other-child" />
    );
    expect(first).toEqual(again);
    expect(first).not.toEqual(other);
  });
});
