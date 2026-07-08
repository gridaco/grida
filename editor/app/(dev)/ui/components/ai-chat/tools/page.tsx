"use client";

/**
 * `/ui/components/ai-chat/tools` — static gallery for every
 * `@/kits/agent-chat` tool-card renderer.
 */

import Link from "next/link";
import { ChatMessageView } from "@/kits/agent-chat";
import { TOOL_CARD_DEMOS } from "../_scenarios";

export default function AiChatToolsDemoPage() {
  return (
    <main className="container mx-auto max-w-screen-xl py-10">
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-muted-foreground text-xs">
            <Link href="/ui/components/ai-chat" className="hover:underline">
              AI Chat
            </Link>{" "}
            / Tools
          </p>
          <h1 className="text-3xl font-bold">AI Chat Tool Cards</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Static settled examples for every agent tool renderer. These use the
            same <code>ChatMessageView</code> path as the chat panel, but render
            all tool calls at once for visual review.
          </p>
        </div>

        <hr />

        <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
          {TOOL_CARD_DEMOS.map((demo) => (
            <div key={demo.id} className="min-w-0">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <h2 className="truncate font-mono text-xs font-medium">
                  {demo.label}
                </h2>
              </div>
              <ChatMessageView message={demo.message} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
