import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "./native-turn-activity";
import { NativeActivityFixtures } from "./native-agent-activity.fixtures";

describe("NativeTurnActivity", () => {
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
        approvalReviews={[
          { decision: "approved", action: "/reference/prices.csv" },
          { decision: "declined", action: "example.org:443" },
        ]}
        renderMessage={(message) => (
          <p key={message.messageId}>{message.text}</p>
        )}
      />
    );
    // The kit's read card names the action and the file, not the tool id.
    expect(html).toContain("Automatically approved");
    expect(html).toContain("example.org:443");
    expect(html).toContain("Automatically declined");
    expect(html).toContain("Read file");
    expect(html).toContain("cart.js");
    expect(html).not.toContain("read_file");
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
