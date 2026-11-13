import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { NativeChatMessage } from "@grida/desktop-bridge";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "./native-turn-activity";

describe("NativeTurnActivity", () => {
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
        renderMessage={(message) => (
          <p key={message.messageId}>{message.text}</p>
        )}
      />
    );
    // The kit's read card names the action and the file, not the tool id.
    expect(html).toContain("Read file");
    expect(html).toContain("cart.js");
    expect(html).not.toContain("read_file");
  });
});
