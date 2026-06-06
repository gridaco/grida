"use client";

/**
 * `/ui/components/ai-chat` — drives the `@/kits/agent-chat` renderer with a
 * simulated AI SDK stream (mock transport, no model). Pick a scenario and
 * Stream it to watch the renderer's streaming states, or toggle Instant to
 * jump straight to the settled view. Pure UI-tuning surface.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { Button } from "@app/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@app/ui/components/select";
import { ComponentDemo } from "../component-demo";
import { DemoChatShell } from "./_chat-shell";
import { createMockTransport } from "./_mock-transport";
import { DEFAULT_SCENARIO_ID, SCENARIOS, type Scenario } from "./_scenarios";

const STREAM_CHUNK_DELAY_IN_MS = 220;

export default function AiChatDemoPage() {
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO_ID);
  const [instant, setInstant] = useState(false);
  const [runNonce, setRunNonce] = useState(0);

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0],
    [scenarioId]
  );
  const chunkDelayInMs = instant ? 0 : STREAM_CHUNK_DELAY_IN_MS;

  // Fresh Chat per scenario / run / speed so the reducer starts clean — mirrors
  // the per-session rebuild in scaffolds/desktop/ai-sidebar/chat.tsx.
  const chat = useMemo(
    () =>
      new Chat<UIMessage>({
        messages: scenario.initial_messages ?? [],
        transport: createMockTransport({
          chunks: scenario.chunks,
          chunkDelayInMs,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scenarioId, runNonce, chunkDelayInMs]
  );

  const { messages, status, error, sendMessage, stop, clearError } = useChat({
    chat,
  });
  const isStreaming = status === "submitted" || status === "streaming";

  // Auto-play the script whenever the Chat is (re)built. The ref guard keeps
  // React StrictMode's double-invoke from firing the same instance twice.
  const firedFor = useRef<Chat<UIMessage> | null>(null);
  useEffect(() => {
    if (firedFor.current === chat) return;
    firedFor.current = chat;
    if (scenario.chunks.length === 0) return;
    void sendMessage({ text: "demo" });
  }, [chat, scenario.chunks.length, sendMessage]);

  const groups = useMemo(() => {
    const map = new Map<string, Scenario[]>();
    for (const s of SCENARIOS) {
      const arr = map.get(s.group) ?? [];
      arr.push(s);
      map.set(s.group, arr);
    }
    return [...map.entries()];
  }, []);

  const hasChunks = scenario.chunks.length > 0;
  // Compaction in-flight state (RFC `session / compaction`). Static per
  // scenario — the shimmer animates continuously so it's tunable; the settled
  // summary is a separate scenario carrying a `data-compaction` message.
  const compacting = scenario.compacting === true;

  return (
    <div className="container mx-auto max-w-screen-xl py-10">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI Chat</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            The <code>@/kits/agent-chat</code> renderer driven by a simulated AI
            SDK stream — no model call. Pick a scenario and press{" "}
            <strong>Stream</strong> to watch it build, or toggle{" "}
            <strong>Instant</strong> to jump to the settled state.
          </p>
        </div>
        <hr />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scenarioId} onValueChange={setScenarioId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups.map(([group, items]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {items.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="sm"
            disabled={!hasChunks || isStreaming}
            onClick={() => {
              setInstant(false);
              setRunNonce((n) => n + 1);
            }}
          >
            Stream
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRunNonce((n) => n + 1)}
          >
            Replay
          </Button>
          {isStreaming && (
            <Button variant="outline" size="sm" onClick={stop}>
              Stop
            </Button>
          )}

          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={instant}
              onChange={(e) => setInstant(e.target.checked)}
            />
            Instant
          </label>
          <span className="ml-auto text-muted-foreground text-xs tabular-nums">
            status: {status}
          </span>
        </div>

        <ComponentDemo>
          <DemoChatShell
            className="w-full max-w-2xl"
            messages={messages}
            isStreaming={isStreaming}
            compacting={compacting}
            error={error}
            onDismissError={clearError}
            actions={{
              onRewind: (id) => console.log("[demo] rewind", id),
              onFork: (id) => console.log("[demo] fork", id),
              disabled: isStreaming,
            }}
          />
        </ComponentDemo>
      </div>
    </div>
  );
}
