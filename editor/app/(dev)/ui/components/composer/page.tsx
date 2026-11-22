import type { ReactNode } from "react";
import {
  CompactionNotice,
  CompactionProgress,
} from "@/kits/agent-chat/message";
import { DesktopComposerDemo } from "./desktop-demo";
import { ComposerDemoVoice } from "./demo-voice";
import { DictateDemo } from "./dictate-demo";
import { ComposerKitDemo } from "./kit-demo";
import { LinkDemo } from "./link-demo";
import { LongPasteDemo } from "./long-paste-demo";
import { PreviewRefreshDemo } from "./preview-refresh-demo";

export default function ComposerPage() {
  return (
    <ComposerDemoVoice>
      <ComposerExamples />
    </ComposerDemoVoice>
  );
}

function ComposerExamples() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-8 sm:px-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Composer playground</h1>
        <p className="text-sm text-muted-foreground">
          Dictation uses your browser’s speech recognition, which may send audio
          to its speech service. When recognition is unavailable, the playground
          inserts a labeled sample transcript.
        </p>
      </header>
      <Example id="question-batch" title="Question batch">
        <p className="text-sm text-muted-foreground">
          Pick an option to advance. Use the arrows to revisit questions. On the
          last question, select Submit, double-click an option, or choose Skip
          to submit without a final answer.
        </p>
        <DesktopComposerDemo scenario="question-batch" />
      </Example>
      <Example id="question" title="Question">
        <DesktopComposerDemo scenario="question" />
      </Example>
      <Example id="blocking-question" title="Blocking question">
        <DesktopComposerDemo scenario="blocking-question" />
      </Example>
      <Example
        id="multiple-questions"
        title="Long choices and multiple questions"
      >
        <DesktopComposerDemo scenario="multiple-questions" />
      </Example>
      <Example id="chat-composer" title="Chat composer">
        <DesktopComposerDemo />
      </Example>
      <Example id="transcript-time-dividers" title="Transcript time dividers">
        <DesktopComposerDemo scenario="time-dividers" />
      </Example>
      <Example id="suggested-prompt" title="Suggested prompt">
        <p className="text-sm text-muted-foreground">
          Focus the composer and press Tab to use the suggestion. Clear the
          draft to see it again.
        </p>
        <DesktopComposerDemo scenario="suggested-prompt" />
      </Example>
      <Example id="dictate" title="Dictate">
        <DictateDemo />
      </Example>
      <Example id="links" title="Links">
        <LinkDemo />
      </Example>
      <Example id="web-preview" title="Web preview">
        <DesktopComposerDemo scenario="web-preview" />
      </Example>
      <Example id="web-preview-refresh" title="Web preview refresh">
        <PreviewRefreshDemo />
      </Example>
      <Example id="message-queue" title="Message queue">
        <DesktopComposerDemo queued />
      </Example>
      <Example id="attachments" title="Attachments">
        <DesktopComposerDemo scenario="attachments" />
      </Example>
      <Example id="long-paste" title="Long pasted text">
        <LongPasteDemo />
      </Example>
      <Example id="svg-text-selection" title="Slide selection">
        <DesktopComposerDemo scenario="svg-selection" />
      </Example>
      <Example id="tool-activity" title="Tool activity">
        <DesktopComposerDemo scenario="activity" />
      </Example>
      <Example id="subagents" title="Subagents">
        <DesktopComposerDemo scenario="subagents" />
      </Example>
      <Example id="streaming" title="Streaming">
        <DesktopComposerDemo scenario="streaming" />
      </Example>
      <Example id="compaction" title="Compaction">
        <div className="flex flex-col gap-4 rounded-xl border bg-background p-4">
          <CompactionNotice
            auto
            summary="The gallery handout is for a self-guided tour."
          />
          <CompactionProgress />
        </div>
        <p className="text-sm text-muted-foreground">
          To try the full flow, send <code>/compact</code> below and select
          Finish compaction.
        </p>
        <DesktopComposerDemo scenario="compaction" />
      </Example>
      <Example id="pause-and-resume" title="Pause and resume">
        <DesktopComposerDemo scenario="paused" />
      </Example>
      <Example id="empty-conversation" title="Empty conversation">
        <DesktopComposerDemo scenario="empty" />
      </Example>
      <Example id="loading" title="Model and access loading">
        <DesktopComposerDemo scenario="loading" />
      </Example>
      <Example id="reconnect" title="Reconnection">
        <DesktopComposerDemo scenario="reconnect" />
      </Example>
      <Example id="approval" title="Permission approval">
        <DesktopComposerDemo scenario="approval" />
      </Example>
      <Example id="library-request" title="Library request">
        <DesktopComposerDemo scenario="library-request" />
      </Example>
      <Example id="kit-and-files" title="Kit and files">
        <ComposerKitDemo />
      </Example>
    </div>
  );
}

function Example({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
