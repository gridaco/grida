"use client";

import { useState } from "react";
import { reply_images } from "@/kits/agent-chat/reply-images";
import { DesktopComposerDemo } from "../composer/desktop-demo";
import { DesktopConversationFixtures } from "../composer/desktop-conversation-fixtures";
import { ComposerDemoVoice } from "../composer/demo-voice";

type Scenario = {
  id: string;
  label: string;
  example: DesktopConversationFixtures.Scenario;
  queued?: true;
};

const scenarios = [
  { id: "conversation", label: "Conversation", example: "text" },
  { id: "empty", label: "New chat", example: "empty" },
  { id: "queue", label: "Message queue", example: "text", queued: true },
  { id: "attachments", label: "Attachments", example: "attachments" },
  {
    id: "inline-workspace-images",
    label: "Inline images",
    example: "inline-workspace-images",
  },
  { id: "question-batch", label: "Question batch", example: "question-batch" },
  { id: "question", label: "Optional question", example: "question" },
  {
    id: "blocking-question",
    label: "Blocking question",
    example: "blocking-question",
  },
  {
    id: "multiple-questions",
    label: "Several open questions",
    example: "multiple-questions",
  },
  { id: "approval", label: "Permission approval", example: "approval" },
  { id: "library", label: "Library request", example: "library-request" },
  { id: "compaction", label: "Compaction", example: "compaction" },
  { id: "streaming", label: "Streaming reply", example: "streaming" },
  { id: "paused", label: "Paused turn", example: "paused" },
  { id: "activity", label: "Tool activity", example: "activity" },
  { id: "subagents", label: "Subagent activity", example: "subagents" },
  {
    id: "time-dividers",
    label: "Transcript history",
    example: "time-dividers",
  },
  { id: "web-preview", label: "Web previews", example: "web-preview" },
  { id: "slide-selection", label: "Slide selection", example: "svg-selection" },
  {
    id: "suggested-prompt",
    label: "Suggested prompt",
    example: "suggested-prompt",
  },
  { id: "loading", label: "Model and access loading", example: "loading" },
  { id: "reconnect", label: "Reconnection", example: "reconnect" },
] satisfies Scenario[];

const demoWorkspaceImages = reply_images.workspaceResolver(
  "/Gallery project",
  (path) =>
    path === DesktopConversationFixtures.workspaceImagePath
      ? "/www/2026-10/wind-garden-repaint/preview.webp"
      : undefined
);

export function NativeChatPlayground({
  initialScenario,
}: {
  initialScenario?: string;
}) {
  const [scenario, setScenario] = useState<Scenario>(
    () => scenarios.find(({ id }) => id === initialScenario) ?? scenarios[0]
  );

  return (
    <div className="min-w-0 space-y-4">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
        Scenario
        <select
          className="max-w-full rounded-md border bg-background px-2.5 py-1.5 text-sm font-normal text-foreground"
          value={scenario.id}
          onChange={(event) => {
            const next = scenarios.find(({ id }) => id === event.target.value);
            if (!next) return;
            setScenario(next);
            const url = new URL(window.location.href);
            url.searchParams.set("scenario", next.id);
            window.history.replaceState(null, "", url);
          }}
        >
          {scenarios.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <ComposerDemoVoice>
        <reply_images.Workspace value={demoWorkspaceImages}>
          <DesktopComposerDemo
            key={scenario.id}
            scenario={scenario.example}
            queued={scenario.queued}
            showcase
          />
        </reply_images.Workspace>
      </ComposerDemoVoice>
    </div>
  );
}
