import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "./native-turn-activity";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";

describe("NativeTurnActivity", () => {
  it.each(["Steer with these images.", ""])(
    "renders retained previews for a steered input with caption %j",
    (text) => {
      const load = vi.fn<(token: string) => Promise<Blob>>();
      const [block] = turn_activity.group(
        [
          {
            messageId: "request",
            role: "user",
            text: "Start the turn.",
            turnId: "turn",
            activityOrder: 1,
          },
          {
            messageId: "progress",
            role: "assistant",
            text: "Working on it.",
            turnId: "turn",
            activityOrder: 2,
          },
          {
            messageId: "steering",
            role: "user",
            text,
            turnId: "turn",
            activityOrder: 3,
            attachments: [
              {
                name: "first.png",
                mimeType: "image/png",
                previewId: "first-selector",
              },
              {
                name: "second.webp",
                mimeType: "image/webp",
                previewId: "second-selector",
              },
            ],
          },
        ],
        [{ turnId: "turn", status: null, startedAtMs: 0 }],
        { turnId: "turn" }
      );
      if (block.kind !== "turn") throw new Error("expected_turn");
      const html = renderToStaticMarkup(
        <NativeTurnActivity
          block={block}
          loadAttachmentPreview={load}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
        />
      );
      const first = html.indexOf('title="Preview first.png"');
      const second = html.indexOf('title="Preview second.webp"');
      expect(first).toBeGreaterThan(html.indexOf("Working on it."));
      expect(second).toBeGreaterThan(first);
      expect(html).not.toContain("Preview unavailable");
      expect(html).not.toContain("-selector");
      expect(load).not.toHaveBeenCalled();
    }
  );

  it("keeps inline compactions with the rest of the turn's work", () => {
    const work: turn_activity.Item[] = [
      {
        kind: "compaction",
        compaction: {
          id: "first",
          status: "succeeded",
          automatic: true,
          activityOrder: 1,
        },
      },
      {
        kind: "commentary",
        message: {
          messageId: "middle",
          role: "assistant",
          text: "Checking the second file.",
          turnId: "t",
          activityOrder: 2,
        },
      },
      {
        kind: "compaction",
        compaction: {
          id: "second",
          status: "succeeded",
          automatic: true,
          activityOrder: 3,
        },
      },
    ];
    const render = (
      finished: boolean,
      compactionDurations?: ReadonlyMap<string, number>,
      visibleItems = work
    ) =>
      renderToStaticMarkup(
        <NativeTurnActivity
          block={{
            kind: "turn",
            turnId: "t",
            requests: [],
            finished,
            outcome: finished ? "succeeded" : null,
            durationMs: null,
            work: visibleItems,
            answers: finished
              ? [
                  {
                    messageId: "final",
                    role: "assistant",
                    text: "Done.",
                    turnId: "t",
                  },
                ]
              : [],
          }}
          compactionDurations={compactionDurations}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
        />
      );
    const live = render(false, new Map([["second", 2000]]));
    const narration = live.indexOf("Checking the second file.");
    expect(live.indexOf("Context compacted")).toBeLessThan(narration);
    expect(live.indexOf("Context compacted · 2s")).toBeGreaterThan(narration);
    const replay = render(true);
    expect(replay).toContain('data-state="collapsed"');
    expect(replay).not.toContain("Context compacted");
    expect(replay).not.toContain("Checking the second file.");
    expect(replay).toContain("Done.");

    const compactionOnly = render(true, undefined, [work[0]]);
    expect(compactionOnly).toContain('aria-expanded="false"');
    expect(compactionOnly).not.toContain("Context compacted");
  });

  it.each([
    {
      from: "openai/gpt-6.2-astra",
      to: "openai/gpt-6.2-sol",
      label: "Model changed from GPT-6.2 Astra to GPT-6.2 Sol.",
    },
    {
      from: "openai/gpt-6.2-sol",
      to: "local/custom-model",
      label: "Model changed from GPT-6.2 Sol to local/custom-model.",
    },
    {
      from: "openai/gpt-5.5",
      to: "gpt-5.5",
      label: "Model changed from openai/gpt-5.5 to gpt-5.5.",
    },
  ])("renders $label before the next request", ({ from, to, label }) => {
    const html = renderToStaticMarkup(
      <NativeTurnActivity
        block={{
          kind: "turn",
          turnId: "t",
          requests: [
            {
              messageId: "next",
              role: "user",
              text: "Next request",
              turnId: "t",
            },
          ],
          modelChange: { from, to },
          finished: false,
          outcome: null,
          durationMs: null,
          work: [],
          answers: [],
        }}
        showModelChanges
        renderMessage={(message) => (
          <p key={message.messageId}>{message.text}</p>
        )}
      />
    );
    expect(html).toContain("lucide-box");
    expect(html).toContain(label);
    expect(html).toContain("Next request");
    expect(html.indexOf(label)).toBeLessThan(html.indexOf("Next request"));
  });

  it("shows a running turn's tool calls with the chat kit's tool cards", () => {
    const messages: NativeChatMessage[] = [
      { messageId: "ask", role: "user", text: "Check the cart.", turnId: "t" },
      {
        messageId: "work",
        role: "assistant",
        text: "Reading the cart module.",
        turnId: "t",
        activity: [
          {
            callId: "c1",
            title: "read_file",
            kind: "read",
            outcome: "succeeded",
            input: { path: "src/cart.js" },
            output: { text: "export const a = 1;\n", truncated: false },
          },
        ],
      },
    ];
    const [block] = turn_activity.group(
      messages,
      [{ turnId: "t", status: null, startedAtMs: 0 }],
      { turnId: "t" },
      null
    );
    expect(block?.kind).toBe("turn");
    const html = renderToStaticMarkup(
      <NativeTurnActivity
        block={block as Extract<typeof block, { kind: "turn" }>}
        onReconsider={() => {}}
        approvalReviews={[
          { decision: "approved", action: "/reference/prices.csv" },
          { decision: "reviewing", action: "first.txt" },
          { decision: "reviewing", action: "second.txt" },
          {
            decision: "declined",
            action: "example.org:443",
            reviewId: "review-1",
            rationale: "The transfer exceeds the request.",
          },
          {
            decision: "declined",
            action: "timeout.test",
            failure: "timed_out",
          },
        ]}
        renderMessage={(message) => (
          <p key={message.messageId}>{message.text}</p>
        )}
      />
    );
    // The kit's read card names the action and the file, not the tool id.
    expect(html).toMatch(
      /Reviewing (?:<!-- -->)?2(?:<!-- -->)? approval requests/
    );
    expect(html).not.toContain("Automatically approved");
    expect(html).not.toContain("prices.csv");
    expect(html).toContain("The transfer exceeds the request.");
    expect(html).toContain("Automatic review timed out");
    expect(html.match(/Request reconsideration/g)).toHaveLength(1);
    expect(html).toContain("example.org:443");
    expect(html).toContain("Automatically declined");
    expect(html).toContain("Read file");
    expect(html).toContain("cart.js");
    expect(html).not.toContain("read_file");
  });

  it("keeps a denial visible when reopening a completed turn", () => {
    const html = renderToStaticMarkup(
      <NativeTurnActivity
        block={{
          kind: "turn",
          turnId: "done",
          finished: true,
          outcome: "succeeded",
          durationMs: 0,
          requests: [],
          work: [],
          answers: [],
        }}
        onReconsider={() => {}}
        approvalReviews={[
          {
            decision: "declined",
            action: "example.org:443",
            reviewId: "review",
            reconsidered: true,
            rationale: "Unconfirmed destination.",
          },
        ]}
        renderMessage={() => null}
      />
    );
    expect(html).toContain('data-state="collapsed"');
    expect(html).toContain("Unconfirmed destination.");
    expect(html).toContain("Reconsideration requested.");
    expect(html).not.toContain("Request reconsideration");
  });

  it("labels legacy unplaced events and makes a child-only finished turn expandable", async () => {
    const fixture = await NativeActivityFixtures.create();
    try {
      const events = [...fixture.data.activity.events].reverse();
      const [block] = turn_activity.group(
        [
          {
            messageId: "ask",
            role: "user",
            text: "Review it",
            turnId: "parent-turn",
          },
        ],
        [{ turnId: "parent-turn", startedAtMs: 0, status: null }],
        { turnId: "parent-turn" }
      );
      const html = renderToStaticMarkup(
        <NativeTurnActivity
          block={block as Extract<typeof block, { kind: "turn" }>}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={events}
          onOpenSubagent={() => {}}
        />
      );
      expect(html).toContain("Reviewer");
      expect(html).toContain("started working");
      expect(html).toContain("finished");
      expect(html).toContain("Subagent events — relative order unavailable");
      expect(html.indexOf("started working")).toBeLessThan(
        html.indexOf("finished")
      );
      expect(html).toContain('data-child-identity="done-child"');
      const finished = {
        ...(block as Extract<typeof block, { kind: "turn" }>),
        finished: true,
        outcome: "succeeded" as const,
      };
      const collapsed = renderToStaticMarkup(
        <NativeTurnActivity
          block={finished}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={events}
          onOpenSubagent={() => {}}
        />
      );
      expect(collapsed).toContain('aria-expanded="false"');
      expect(collapsed).toContain("Worked");
    } finally {
      fixture.dispose();
    }
  });

  it.each([
    ["running", "Searching for TODO in src"],
    ["succeeded", "Searched for TODO in src"],
    ["failed", "Failed to search for TODO in src"],
  ] as const)(
    "renders the shared search action for a %s command",
    (outcome, label) => {
      const [block] = turn_activity.group(
        [
          {
            messageId: "work",
            role: "assistant",
            text: "",
            turnId: "turn",
            activity: [
              {
                callId: "search",
                title: "exec_command",
                kind: "execute",
                input: { cmd: "rg TODO src" },
                commandActions: [
                  { kind: "search", query: "TODO", path: "src" },
                ],
                outcome,
              },
            ],
          },
        ],
        [{ turnId: "turn", status: null, startedAtMs: 0 }],
        { turnId: "turn" }
      );
      if (block.kind !== "turn") throw new Error("expected_turn");
      const html = renderToStaticMarkup(
        <NativeTurnActivity block={block} renderMessage={() => null} />
      );
      expect(html).toContain(label);
    }
  );

  it("keeps stopped work expanded, places a child stop correctly, and leaves the final answer outside", async () => {
    const fixture = await NativeActivityFixtures.create();
    try {
      const messages: NativeChatMessage[] = [
        {
          messageId: "before",
          role: "assistant",
          turnId: "parent-turn",
          text: "Before the child stopped",
          phase: "progress",
          activityOrder: 1,
        },
        {
          messageId: "after",
          role: "assistant",
          turnId: "parent-turn",
          text: "After the child stopped",
          phase: "progress",
          activityOrder: 3,
        },
        {
          messageId: "answer",
          role: "assistant",
          turnId: "parent-turn",
          text: "Final answer outside activity",
          phase: "answer",
          activityOrder: 4,
        },
      ];
      const [block] = turn_activity.group(
        messages,
        [{ turnId: "parent-turn", startedAtMs: 0, status: "cancelled" }],
        null
      );
      if (block.kind !== "turn") throw new Error("expected_turn");
      const html = renderToStaticMarkup(
        <NativeTurnActivity
          block={block}
          renderMessage={(message) => (
            <p key={message.messageId}>{message.text}</p>
          )}
          subagentEvents={[
            {
              ...fixture.data.activity.events[1],
              activityOrder: 2,
              status: "cancelled",
            },
          ]}
          onOpenSubagent={() => {}}
        />
      );
      expect(html).toContain("You stopped");
      expect(html).not.toContain("aria-expanded");
      expect(html).not.toContain("relative order unavailable");
      expect(html.indexOf("Before the child stopped")).toBeLessThan(
        html.indexOf('data-child-identity="done-child"')
      );
      expect(html.indexOf('data-child-identity="done-child"')).toBeLessThan(
        html.indexOf("After the child stopped")
      );
      expect(html.indexOf("After the child stopped")).toBeLessThan(
        html.indexOf("Final answer outside activity")
      );
    } finally {
      fixture.dispose();
    }
  });
});
