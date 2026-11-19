"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { SquareIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { TooltipProvider } from "@app/ui/components/tooltip";
import {
  ComposerAttachmentCard,
  ComposerDropArea,
  type ComposerTransfer,
  type ComposerController,
} from "@/kits/composer";
import { AgentComposer } from "@/scaffolds/desktop/shared/agent-composer";
import { ContextMeter } from "@/scaffolds/desktop/shared/context-meter";
import { NativeComposerQueue } from "@/scaffolds/desktop/workbench/native-composer-tray";
import type {
  NativeChatEffort,
  NativeChatMessage,
} from "@grida/desktop-bridge";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import { DesktopQueueFixture } from "./desktop-queue-fixture";
import { DesktopSubmissionFixture } from "./desktop-submission-fixture";
import { DesktopConversation } from "./desktop-conversation";
import { DesktopConversationFixtures as conversations } from "./desktop-conversation-fixtures";

/** The production composer and preview surfaces, backed by local fixture state. */
export function DesktopComposerDemo() {
  const [generation, setGeneration] = useState(0);
  const [home, setHome] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [image, setImage] = useState(false);
  const [fileAttachment, setFileAttachment] = useState(false);
  const [plan, setPlan] = useState(false);
  const [goal, setGoal] = useState(false);
  const [modeNotice, setModeNotice] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(fixtures.profiles.active);
  const [effort, setEffort] = useState<NativeChatEffort>("high");
  const [queue] = useState(() => new DesktopQueueFixture());
  const [submission] = useState(() => new DesktopSubmissionFixture());
  const submissionView = useSyncExternalStore(
    submission.subscribe,
    submission.read,
    submission.read
  );
  const queueView = useSyncExternalStore(
    queue.subscribe,
    queue.read,
    queue.read
  );
  const busy = !home && queueView.running;
  const pendingGoal =
    !home && queueView.queue.items.some((item) => item.goalStart);
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
  const [svgTextSelected, setSvgTextSelected] = useState(true);
  const selectionContext =
    !home &&
    scenario === "svg-selection" &&
    svgTextSelected &&
    !plan &&
    !goal &&
    !image &&
    !fileAttachment
      ? "svg-text"
      : undefined;
  const [messages, setMessages] = useState<readonly NativeChatMessage[]>(
    () => conversations.get("text").messages
  );
  const [edit, setEdit] = useState<{
    messageId: string;
    text: string;
    submitting: boolean;
    error?: string;
  } | null>(null);
  const laterMessages = edit
    ? messages.length -
      messages.findIndex((message) => message.messageId === edit.messageId) -
      1
    : 0;
  const submitEdit = async () => {
    if (!edit || edit.submitting || !edit.text.trim()) return;
    const { messageId, text } = edit;
    setEdit({ ...edit, submitting: true, error: undefined });
    try {
      await submission.wait();
      setMessages((current) => {
        const index = current.findIndex(
          (message) => message.messageId === messageId
        );
        if (index < 0) return current;
        return [
          ...current.slice(0, index),
          { ...current[index], text, svgTextSelection: undefined },
        ];
      });
      setEdit(null);
    } catch (error) {
      setEdit((current) =>
        current ? { ...current, submitting: false, error: String(error) } : null
      );
    }
  };
  const draft = useRef<Pick<ComposerController, "appendText" | "focus">>(null);
  const reset = () => {
    setGeneration((value) => value + 1);
    setHome(false);
    setNarrow(false);
    setImage(false);
    setFileAttachment(false);
    setPlan(false);
    setGoal(false);
    setModeNotice(null);
    setActive(fixtures.profiles.active);
    setEffort("high");
    submission.reset();
    queue.reset();
    setScenario("text");
    setSvgTextSelected(true);
    setMessages(conversations.get("text").messages);
    setEdit(null);
  };
  const submit = async (text: string) => {
    await submission.wait();
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
          ...(selectionContext && { svgTextSelection: true }),
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

  const transferAttachment = ({ resources }: ComposerTransfer.Event) => {
    if (
      queueView.queueDraft ||
      submissionView.pending ||
      resources.length === 0
    )
      return;
    if (resources.length !== 1) {
      setModeNotice("Attach one file at a time.");
      return;
    }
    if (goal) {
      setModeNotice("Remove the goal intent to attach a file.");
      return;
    }
    const resource = resources[0];
    const raster =
      resource.kind === "file" &&
      /^image\/(?:png|jpeg|webp|gif)$/.test(resource.file.type);
    setImage(raster);
    setFileAttachment(!raster);
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
            Surface
            <select
              aria-label="Composer surface"
              value={home ? "home" : "workspace"}
              disabled={edit?.submitting}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              onChange={(event) => {
                queue.closeQueueDraft();
                setEdit(null);
                setHome(event.currentTarget.value === "home");
              }}
            >
              <option value="workspace">Workspace</option>
              <option value="home">Home</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Conversation
            <select
              aria-label="Conversation example"
              value={scenario}
              disabled={edit?.submitting}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              onChange={(event) => {
                const next = event.currentTarget
                  .value as conversations.Scenario;
                setScenario(next);
                setEdit(null);
                setMessages(conversations.get(next).messages);
                if (next === "svg-selection") {
                  setSvgTextSelected(true);
                  queue.setRunning(false);
                }
              }}
            >
              {conversations.scenarios.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.label}
                </option>
              ))}
            </select>
          </label>
          {!home && scenario === "svg-selection" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={svgTextSelected}
                onChange={(event) => setSvgTextSelected(event.target.checked)}
              />
              SVG text selected
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={busy}
              disabled={home || !!edit}
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
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={submissionView.hold}
              disabled={submissionView.pending}
              onChange={(event) => submission.hold(event.target.checked)}
            />
            Hold submission
          </label>
          {submissionView.pending && (
            <>
              <Button size="sm" variant="outline" onClick={submission.accept}>
                Accept submission
              </Button>
              <Button size="sm" variant="outline" onClick={submission.refuse}>
                Refuse submission
              </Button>
            </>
          )}
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
        <ComposerDropArea
          data-testid="desktop-composer-surface"
          role="region"
          aria-label={home ? "Home composer surface" : "Chat composer surface"}
          onTransfer={transferAttachment}
          className={`mx-auto flex h-[min(44rem,80vh)] min-h-[32rem] w-full flex-col rounded-xl border bg-background p-3 ${narrow ? "max-w-sm" : "max-w-3xl"}`}
        >
          {home ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <h2 className="text-xl font-medium">
                What would you like to make?
              </h2>
              <p className="text-sm text-muted-foreground">
                Home uses the same composer. Pick a model, effort and intent, or
                attach a reference before starting.
              </p>
            </div>
          ) : (
            <DesktopConversation
              key={`${generation}-${scenario}`}
              scenario={scenario}
              messages={messages}
              running={busy}
              onEdit={
                !busy &&
                !edit &&
                !queueView.queueDraft &&
                !submissionView.pending
                  ? (messageId) => {
                      const message = messages.find(
                        (entry) => entry.messageId === messageId
                      );
                      if (message)
                        setEdit({
                          messageId,
                          text: message.text ?? "",
                          submitting: false,
                        });
                    }
                  : undefined
              }
              edit={
                edit
                  ? {
                      ...edit,
                      note: edit.error ? (
                        <span role="alert">{edit.error}</span>
                      ) : (
                        <p>
                          {laterMessages > 0
                            ? `Replaces this and ${laterMessages} later ${laterMessages === 1 ? "message" : "messages"}.`
                            : "Replaces this message."}{" "}
                          Completed work isn’t undone.
                        </p>
                      ),
                      onChange: (text) => setEdit({ ...edit, text }),
                      onCancel: () => setEdit(null),
                      onSubmit: () => void submitEdit(),
                    }
                  : undefined
              }
            />
          )}
          {!home && queueView.steered.length > 0 && (
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
          {!home && queueView.count > 0 && (
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
          <AgentComposer
            key={generation}
            selectionContext={selectionContext}
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
            catalog={{
              commands: [],
              mentions: fixtures.catalog.mentions,
            }}
            draftRef={draft}
            autofocus={false}
            isStreaming={false}
            busy={busy}
            className="@container"
            canSubmit={!edit && (!goal || canStartGoal)}
            emptyAction={
              busy
                ? {
                    label: "Pause",
                    icon: <SquareIcon className="size-3.5" />,
                    onClick: () => queue.setRunning(false),
                    confirmWithEscape: true,
                  }
                : undefined
            }
            awaitSubmission
            submissionScope={generation}
            onSubmit={submit}
            onStop={() => queue.setRunning(false)}
            allowEmptySubmit={image || fileAttachment}
            commands={[
              {
                id: "plan",
                run: () => {
                  setPlan(true);
                  setModeNotice(null);
                },
              },
              { id: "goal", run: selectGoal },
              ...(!home
                ? [
                    {
                      id: "compact" as const,
                      run: () =>
                        setModeNotice("Compaction is a local preview here."),
                    },
                    {
                      id: "fork" as const,
                      run: () =>
                        setModeNotice("Forking is a local preview here."),
                    },
                  ]
                : []),
            ]}
            onAttachmentTransfer={transferAttachment}
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
            actions={{
              files: {
                disabled: goal,
                onSelect: () => {
                  setFileAttachment(true);
                  setImage(false);
                },
              },
              image: {
                disabled: goal,
                onSelect: () => {
                  setImage(true);
                  setFileAttachment(false);
                },
              },
              goal: {
                active: goal,
                disabled: !canStartGoal,
                onChange: (enabled) => {
                  if (enabled) selectGoal();
                  else {
                    setGoal(false);
                    setModeNotice(null);
                  }
                },
              },
              plan: { active: plan, onChange: setPlan },
            }}
            modelLeading={
              !home && (
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
              )
            }
            model={{
              profiles: { ...fixtures.profiles, active },
              busy: false,
              onSelect: (selection) =>
                setActive(selection.kind === "default" ? null : selection.id),
              onRefresh: () => {},
              effort,
              onEffort: setEffort,
              ultraAvailable: true,
              goal,
            }}
          />
        </ComposerDropArea>
      </main>
    </TooltipProvider>
  );
}
