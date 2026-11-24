"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@app/ui/components/button";
import { TooltipProvider } from "@app/ui/components/tooltip";
import { NativeAgentPane } from "@/scaffolds/desktop/workbench/native-agent-pane";
import type { Browser } from "@/lib/desktop/browser";
import { PagePreviews } from "@/lib/desktop/page-previews";
import {
  BrowserOpen,
  BrowserPreview,
} from "@/lib/desktop/browser-open-context";
import type { SubagentPlacement } from "@/scaffolds/desktop/workbench/subagent-placement";
import {
  NativeChatDemoPanelLayout,
  NativeChatDemoPanels,
} from "../native-chat/panels";
import { NativeChatWorkspaceFixture } from "../native-chat/workspace-fixture";
import { DesktopChatFixture } from "./desktop-chat-fixture";
import { DesktopConversationFixtures as conversations } from "./desktop-conversation-fixtures";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import type { DesktopRequestFixture } from "./desktop-request-fixture";

const subscribeStatic = () => () => {};
const sideChats = { present() {}, withdraw() {} };
const suggestionPreferences = {
  get: async () => ({ enabled: true, revision: 1 }),
  onChange: () => () => {},
};
const inlineSubagents: SubagentPlacement = {
  present: (presentation) => presentation.close(),
  withdraw() {},
};

export function DesktopComposerDemo({
  scenario: initialScenario = "text",
  queued = false,
  showcase = false,
}: {
  scenario?: conversations.Scenario;
  queued?: boolean;
  showcase?: boolean;
}) {
  const [root, setRoot] = useState(
    () => new DesktopChatFixture(initialScenario, queued)
  );
  const workspace = useMemo(
    () => (showcase ? new NativeChatWorkspaceFixture(root) : null),
    [root, showcase]
  );
  const panels = useMemo(
    () => (workspace ? new NativeChatDemoPanels() : null),
    [workspace]
  );
  const fixture = useSyncExternalStore(
    workspace?.subscribe ?? subscribeStatic,
    workspace?.read ?? (() => root),
    () => root
  );
  const scenario = fixture.scenario;
  const [openCount, setOpenCount] = useState(0);
  const [reopenedSession, setReopenedSession] = useState<string>();
  const [streaming, setStreaming] = useState(initialScenario === "streaming");
  const running = useSyncExternalStore(
    fixture.subscribeRunning,
    fixture.readRunning,
    fixture.readRunning
  );
  const replyHeld = useSyncExternalStore(
    fixture.subscribeRunning,
    fixture.readReplyHeld,
    fixture.readReplyHeld
  );
  const canFinishReply = useSyncExternalStore(
    fixture.subscribeRunning,
    fixture.canFinishReply,
    fixture.canFinishReply
  );
  const [narrow, setNarrow] = useState(scenario === "multiple-questions");
  const selected = useSyncExternalStore(
    fixture.subscribeSvgSelection,
    fixture.readSvgSelected,
    fixture.readSvgSelected
  );
  const submission = useSyncExternalStore(
    fixture.submission.subscribe,
    fixture.submission.read,
    fixture.submission.read
  );
  const compaction = useSyncExternalStore(
    fixture.compaction.subscribe,
    fixture.compaction.read,
    fixture.compaction.read
  );
  const question =
    scenario === "question" ||
    (showcase &&
      (scenario === "blocking-question" ||
        scenario === "question-batch" ||
        scenario === "multiple-questions"));
  const attachments = scenario === "attachments";
  const webPreview = scenario === "web-preview";
  const previews = useMemo(
    () =>
      new PagePreviews.Controller(async (href, signal) => ({
        metadata: await fixtures.loadWebPreview(href, signal),
      })),
    [fixture]
  );
  const [openRequest, setOpenRequest] = useState<{
    url: string;
    destination?: Browser.OpenDestination;
  } | null>(null);
  const openWeb = useCallback<Browser.OpenHandler>((url, destination) => {
    setOpenRequest({ url, destination });
    return true;
  }, []);

  useEffect(() => {
    if (scenario !== "question" || !streaming) return;
    const text = conversations.question.progress;
    let length = 0;
    const timer = window.setInterval(() => {
      length += 6;
      fixture.publishProgress(text.slice(0, length));
      if (length >= text.length) setStreaming(false);
    }, 150);
    return () => window.clearInterval(timer);
  }, [fixture, scenario, streaming]);

  const reset = () => {
    if (workspace) workspace.resetRequests();
    else fixture.resetRequests();
    setRoot(new DesktopChatFixture(initialScenario, queued));
    setReopenedSession(undefined);
    setStreaming(initialScenario === "streaming");
    setOpenRequest(null);
  };

  const pane = (
    <NativeAgentPane
      key={`${root.sessionId}:${openCount}`}
      bridge={workspace?.bridge ?? fixture.bridge}
      workingDirectory={showcase ? "/Gallery project" : undefined}
      readWorkspaceDirectory={workspace?.readdir}
      predictionPreferences={
        scenario === "suggested-prompt" ? suggestionPreferences : undefined
      }
      initialSession={reopenedSession ?? root.sessionId}
      editorSurfaces={
        scenario === "svg-selection" ? fixture.editorSurfaces : undefined
      }
      sideChatPlacement={panels?.sideChats ?? sideChats}
      libraryRequestSource={
        queued || showcase || scenario === "library-request"
          ? fixtures.libraryRequestSource
          : undefined
      }
      subagentPlacement={
        panels?.subagents ??
        (scenario === "subagents" ? inlineSubagents : undefined)
      }
      autofocus={showcase}
    />
  );

  return (
    <TooltipProvider>
      <div data-testid="desktop-composer-playground" className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {webPreview && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={!running}
                onClick={() => fixture.setRunning(false)}
              >
                Finish reply
              </Button>
            </>
          )}
          {openRequest && (
            <span
              role="status"
              className="min-w-0 break-all text-muted-foreground"
            >
              {openRequest.destination === "system"
                ? "System browser requested for"
                : "Workbench browser requested for"}{" "}
              {openRequest.url}
            </span>
          )}
          {(scenario === "question" || scenario === "streaming") && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={streaming}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setStreaming(enabled);
                  if (scenario === "streaming") fixture.setRunning(enabled);
                }}
              />
              Streaming
            </label>
          )}
          {(showcase || question || scenario === "multiple-questions") && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={narrow}
                onChange={(event) => setNarrow(event.target.checked)}
              />
              Compact pane
            </label>
          )}
          {scenario === "svg-selection" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected}
                onChange={(event) =>
                  fixture.setSvgSelected(event.target.checked)
                }
              />
              Slide item selected
            </label>
          )}
          {queued && fixture === root && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={running}
                onChange={(event) => fixture.setRunning(event.target.checked)}
              />
              Running turn
            </label>
          )}
          {(showcase || scenario === "text" || question || attachments) && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={submission.hold}
                disabled={submission.pending}
                onChange={(event) =>
                  fixture.submission.hold(event.target.checked)
                }
              />
              {question ? "Hold answer" : "Hold submission"}
            </label>
          )}
          {submission.pending && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={fixture.submission.accept}
              >
                {question ? "Accept answer" : "Accept submission"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={fixture.submission.refuse}
              >
                {question ? "Refuse answer" : "Refuse submission"}
              </Button>
            </>
          )}
          {showcase && !question && (
            <>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={replyHeld}
                  onChange={(event) =>
                    fixture.setReplyHeld(event.target.checked)
                  }
                />
                Hold replies
              </label>
              {canFinishReply && replyHeld && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fixture.finishReply}
                  >
                    Finish reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fixture.failReply}
                  >
                    Fail reply
                  </Button>
                </>
              )}
            </>
          )}
          {(showcase || attachments) && (
            <Button
              size="sm"
              variant="outline"
              disabled={submission.pending}
              onClick={() => {
                setReopenedSession(fixture.sessionId);
                setOpenCount((current) => current + 1);
              }}
            >
              Reopen chat
            </Button>
          )}
          {question && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => fixture.expireQuestions()}
            >
              Expire question
            </Button>
          )}
          {scenario === "loading" && (
            <>
              <ReadControls label="Model read" fixture={fixture.modelsRead} />
              <ReadControls label="Access read" fixture={fixture.accessRead} />
            </>
          )}
          {scenario === "reconnect" && (
            <ReadControls
              label="Reconnection"
              fixture={fixture.reconnect}
              disconnect={() => fixture.disconnect()}
            />
          )}
          {(scenario === "compaction" || (showcase && compaction.pending)) && (
            <Button
              size="sm"
              variant="outline"
              disabled={!compaction.pending}
              onClick={fixture.compaction.accept}
            >
              Finish compaction
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={reset}>
            Reset
          </Button>
        </div>
        <div
          className={`flex w-full flex-col overflow-hidden rounded-xl border bg-background ${
            narrow
              ? "h-[36rem] max-w-[23rem]"
              : scenario === "streaming"
                ? "h-[30rem]"
                : "h-[min(42rem,80vh)] min-h-[36rem]"
          }`}
        >
          <BrowserOpen value={showcase || webPreview ? openWeb : null}>
            <BrowserPreview value={showcase || webPreview ? previews : null}>
              {panels ? (
                <NativeChatDemoPanelLayout host={panels}>
                  {pane}
                </NativeChatDemoPanelLayout>
              ) : (
                pane
              )}
            </BrowserPreview>
          </BrowserOpen>
        </div>
      </div>
    </TooltipProvider>
  );
}

function ReadControls({
  label,
  fixture,
  disconnect,
}: {
  label: string;
  fixture: DesktopRequestFixture;
  disconnect?: () => void;
}) {
  const { pending, hold } = useSyncExternalStore(
    fixture.subscribe,
    fixture.read,
    fixture.read
  );
  if (!hold && disconnect)
    return (
      <Button size="sm" variant="outline" onClick={disconnect}>
        Disconnect
      </Button>
    );
  if (!pending) return null;
  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span>{label}</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          fixture.hold(false);
          fixture.accept();
        }}
      >
        Complete
      </Button>
      <Button size="sm" variant="outline" onClick={fixture.refuse}>
        Fail
      </Button>
    </div>
  );
}
