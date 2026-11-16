import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import {
  NativeAgentActivity,
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
    expect(html).toContain("captured-model · High");
    expect(html).toContain("Compare the two approaches.");
    expect(html).toContain("The second approach preserves the contract.");
    expect(html).not.toContain("A bounded result preview.");
    expect(html).not.toContain("A live conversation is unavailable");
    expect(html).not.toContain("View changes");
    expect(html).not.toContain("Undo");
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

  it("shows actual progressive output and only currently offered child controls", async () => {
    const f = await fixture();
    await f.controller.openChild("working-child");
    const html = renderToStaticMarkup(
      <NativeSubagentActivity controller={f.controller} />
    );
    expect(html).toContain("I am comparing the evidence.");
    expect(html).toContain("Stop subagent");
    expect(html).toContain("Pause subagent");
    expect(html).toContain("Steer subagent");
    expect(html).toContain("Send information");
    expect(html).not.toContain("Resume subagent");
    expect(html).not.toContain("Withdraw selected assignment");
  });

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
    expect(empty).toContain("No background processes.");
  });

  it("exposes the activity entry without requiring a running process", async () => {
    const f = await fixture();
    f.processes.receive([]);
    const html = renderToStaticMarkup(
      <NativeAgentActivity subagents={null} processes={f.processes} />
    );
    expect(html).toContain("Open agent activity");
    expect(html).not.toContain("No background processes.");
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
