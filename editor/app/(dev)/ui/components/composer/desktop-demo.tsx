"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  PaperclipIcon,
  GoalIcon,
  ImageIcon,
  ListChecksIcon,
  SquareIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { TooltipProvider } from "@app/ui/components/tooltip";
import {
  ComposerAttachmentCard,
  type ComposerController,
} from "@/kits/composer";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import { AgentComposerTools } from "@/scaffolds/desktop/shared/agent-composer-tools";
import { ContextMeter } from "@/scaffolds/desktop/shared/context-meter";
import { NativeModelPicker } from "@/scaffolds/desktop/workbench/native-chat-controls";
import { NativeComposerQueue } from "@/scaffolds/desktop/workbench/native-composer-tray";
import type {
  NativeChatEffort,
  NativeChatMessage,
} from "@grida/desktop-bridge";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import { DesktopQueueFixture } from "./desktop-queue-fixture";
import { DesktopConversation } from "./desktop-conversation";
import { DesktopConversationFixtures as conversations } from "./desktop-conversation-fixtures";
import { DesktopChatTabs } from "./desktop-chat-tabs";

/** The production composer and preview surfaces, backed by local fixture state. */
export function DesktopComposerDemo() {
  const [generation, setGeneration] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const [image, setImage] = useState(false);
  const [fileAttachment, setFileAttachment] = useState(false);
  const [plan, setPlan] = useState(false);
  const [goal, setGoal] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(fixtures.profiles.active);
  const [effort, setEffort] = useState<NativeChatEffort>("high");
  const [queue] = useState(() => new DesktopQueueFixture());
  const queueView = useSyncExternalStore(
    queue.subscribe,
    queue.read,
    queue.read
  );
  const busy = queueView.running;
  const pendingGoal = queueView.queue.items.some((item) => item.goalStart);
  const canStartGoal = !image && !fileAttachment && !pendingGoal;
  const selectGoal = () => {
    if (!canStartGoal) {
      setModeNotice(
        pendingGoal
          ? "A goal is already waiting in the queue."
          : "Send or remove the attachment before starting a goal."
      );
      return;
    }
    setModeNotice(null);
    setGoal(true);
  };
  const [scenario, setScenario] = useState<conversations.Scenario>("text");
  const [messages, setMessages] = useState<readonly NativeChatMessage[]>(
    () => conversations.get("text").messages
  );
  const draft = useRef<Pick<ComposerController, "appendText" | "focus">>(null);
  const reset = () => {
    setGeneration((value) => value + 1);
    setNarrow(false);
    setImage(false);
    setFileAttachment(false);
    setPlan(false);
    setGoal(false);
    setModeNotice(null);
    setActive(fixtures.profiles.active);
    setEffort("high");
    queue.reset();
    setScenario("text");
    setMessages(conversations.get("text").messages);
  };
  const submit = async (text: string) => {
    if (busy) {
      queue.enqueue(
        text,
        image ? [fixtures.image] : fileAttachment ? [fixtures.file] : undefined,
        {
          ...(plan && { operatingRegime: "plan" }),
          ...(effort === "ultra" && { effort: "ultra" }),
          ...(goal && {
            goalStart: {
              objective: text,
              criteria: [text],
              automatic: true,
              operatingRegime: plan ? "plan" : "act",
              effort,
            },
          }),
        }
      );
    } else {
      setMessages((current) => [
        ...current,
        {
          messageId: crypto.randomUUID(),
          role: "user",
          text,
          ...(image
            ? { attachments: [fixtures.image] }
            : fileAttachment
              ? { attachments: [fixtures.file] }
              : {}),
        },
      ]);
    }
    setImage(false);
    setFileAttachment(false);
    setGoal(false);
    setModeNotice(null);
  };

  return (
    <TooltipProvider>
      <main
        data-testid="desktop-composer-playground"
        className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6"
      >
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            Conversation
            <select
              aria-label="Conversation example"
              value={scenario}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              onChange={(event) => {
                const next = event.currentTarget
                  .value as conversations.Scenario;
                setScenario(next);
                setMessages(conversations.get(next).messages);
              }}
            >
              {conversations.scenarios.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={busy}
              onChange={(event) => queue.setRunning(event.target.checked)}
            />
            Running turn (send to queue)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={narrow}
              onChange={(event) => setNarrow(event.target.checked)}
            />
            Narrow composer
          </label>
          <Button size="sm" variant="outline" onClick={reset}>
            Reset examples
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Type / or @, use the + menu, click outside or press Escape. Hover or
          focus a queued message to read it. Drag its handle to reorder, or
          focus the handle and use Space, arrow keys, then Space. Sends stay on
          this page.
        </p>
        <section
          className={`mx-auto flex h-[min(44rem,80vh)] min-h-[32rem] w-full flex-col rounded-xl border bg-background p-3 ${narrow ? "max-w-sm" : "max-w-3xl"}`}
        >
          <DesktopConversation
            key={`${generation}-${scenario}`}
            scenario={scenario}
            messages={messages}
            running={busy}
          />
          {queueView.steered.length > 0 && (
            <div
              role="status"
              aria-label="Steering preview"
              className="space-y-1"
            >
              <p className="text-xs font-medium text-muted-foreground">
                Steered into the running turn (local preview)
              </p>
              <p className="whitespace-pre-wrap break-words">
                {queueView.steered.at(-1)}
              </p>
            </div>
          )}
          {queueView.count > 0 && (
            <div className="mx-2 shrink-0 divide-y overflow-hidden rounded-t-xl border border-b-0 bg-background text-sm">
              <NativeComposerQueue
                controller={queue}
                view={queueView}
                queue={queueView.queue}
                count={queueView.count}
                onReturnedText={(text) => {
                  void draft.current?.appendText(text, 512 * 1024);
                  draft.current?.focus();
                }}
              />
            </div>
          )}
          {modeNotice && (
            <p
              role="status"
              className="px-1 pb-1 text-xs text-muted-foreground"
            >
              {modeNotice}
            </p>
          )}
          <AgentComposerInput
            key={generation}
            editing={
              queueView.queueDraft
                ? {
                    id: `${generation}:${queueView.queueDraft.inputId}`,
                    text: queueView.queueDraft.text,
                    label: "Editing queued message",
                    busy: queueView.acting,
                    allowEmpty: queueView.queueDraft.allowEmpty,
                    onSave: (text) => queue.saveQueueDraft(text),
                    onCancel: () => queue.closeQueueDraft(),
                  }
                : undefined
            }
            catalog={fixtures.catalog}
            draftRef={draft}
            autofocus={false}
            isStreaming={false}
            busy={busy}
            className="@container"
            canSubmit={!goal || canStartGoal}
            placeholder={
              goal
                ? "Describe the goal…"
                : plan
                  ? "What would you like to plan?"
                  : image || fileAttachment
                    ? "Add a message to send this attachment…"
                    : busy || queueView.count > 0
                      ? "Queue a follow-up…"
                      : undefined
            }
            emptyAction={
              busy
                ? {
                    label: "Pause",
                    icon: <SquareIcon className="size-3.5" />,
                    onClick: () => queue.setRunning(false),
                  }
                : undefined
            }
            awaitSubmission
            submissionScope={generation}
            onSubmit={submit}
            onStop={() => queue.setRunning(false)}
            allowEmptySubmit={image || fileAttachment}
            onCommandSelect={(command) => {
              if (command.id === "plan") {
                setPlan(true);
                setModeNotice(null);
                return true;
              }
              if (command.id === "goal") {
                selectGoal();
                return true;
              }
              return false;
            }}
            onAttachmentTransfer={(event) => {
              if (goal) return;
              if (
                event.resources.some((resource) => resource.kind === "file")
              ) {
                setImage(true);
                setFileAttachment(false);
              }
            }}
            attachments={
              image ? (
                <ComposerAttachmentCard
                  attachment={{
                    kind: "file",
                    id: "fixture-image",
                    name: fixtures.image.name,
                    mime: "image/jpeg",
                    url: fixtures.imageUrl,
                  }}
                  onRemove={() => {
                    setImage(false);
                    setModeNotice(null);
                  }}
                />
              ) : fileAttachment ? (
                <ComposerAttachmentCard
                  attachment={{
                    kind: "file",
                    id: "fixture-file",
                    name: fixtures.file.name,
                    mime: "text/markdown",
                  }}
                  onRemove={() => {
                    setFileAttachment(false);
                    setModeNotice(null);
                  }}
                />
              ) : null
            }
            toolbarStart={
              <AgentComposerTools
                actions={[
                  {
                    id: "files",
                    title: "Files",
                    icon: <PaperclipIcon />,
                    disabled: goal,
                    onSelect: () => {
                      setFileAttachment(true);
                      setImage(false);
                    },
                  },
                  {
                    id: "image",
                    title: "Image",
                    icon: <ImageIcon />,
                    disabled: goal,
                    onSelect: () => {
                      setImage(true);
                      setFileAttachment(false);
                    },
                  },
                  {
                    id: "goal",
                    title: "Goal",
                    description: "Set a goal to keep pursuing",
                    icon: <GoalIcon />,
                    disabled: goal || !canStartGoal,
                    onSelect: selectGoal,
                  },
                  {
                    id: "plan",
                    title: "Plan mode",
                    description: plan
                      ? "Turn plan mode off"
                      : "Turn plan mode on",
                    icon: <ListChecksIcon />,
                    onSelect: () => setPlan((current) => !current),
                  },
                ]}
                intents={[
                  ...(plan
                    ? [
                        {
                          id: "plan",
                          icon: <ListChecksIcon />,
                          label: "Plan",
                          onRemove: () => setPlan(false),
                        },
                      ]
                    : []),
                  ...(goal
                    ? [
                        {
                          id: "goal",
                          icon: <GoalIcon />,
                          label: "Goal",
                          onRemove: () => {
                            setGoal(false);
                            setModeNotice(null);
                          },
                        },
                      ]
                    : []),
                ]}
              />
            }
            toolbarEnd={
              <>
                <ContextMeter
                  usage={{
                    usedTokens: 18000,
                    maxTokens: 128000,
                    percent: 18000 / 128000,
                    breakdown: {
                      user: 4000,
                      assistant: 10000,
                      tools: 4000,
                      other: 0,
                    },
                  }}
                />
                <NativeModelPicker
                  profiles={{ ...fixtures.profiles, active }}
                  busy={false}
                  onSelect={(selection) =>
                    setActive(
                      selection.kind === "default" ? null : selection.id
                    )
                  }
                  onRefresh={() => {}}
                  effort={effort}
                  onEffort={setEffort}
                  ultraAvailable
                  goal={goal}
                />
              </>
            }
          />
        </section>
        <DesktopChatTabs key={generation} messages={messages} />
      </main>
    </TooltipProvider>
  );
}
