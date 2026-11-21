"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@app/ui/components/button";
import { TooltipProvider } from "@app/ui/components/tooltip";
import { NativeAgentPane } from "@/scaffolds/desktop/workbench/native-agent-pane";
import type { Browser } from "@/lib/desktop/browser";
import {
  BrowserOpen,
  BrowserPreview,
} from "@/lib/desktop/browser-open-context";
import type { SubagentPlacement } from "@/scaffolds/desktop/workbench/subagent-placement";
import { DesktopChatFixture } from "./desktop-chat-fixture";
import { DesktopConversationFixtures as conversations } from "./desktop-conversation-fixtures";
import { DesktopComposerFixtures as fixtures } from "./desktop-fixtures";
import type { DesktopRequestFixture } from "./desktop-request-fixture";

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
  scenario = "text",
  queued = false,
}: {
  scenario?: conversations.Scenario;
  queued?: boolean;
}) {
  const [fixture, setFixture] = useState(
    () => new DesktopChatFixture(scenario, queued)
  );
  const [streaming, setStreaming] = useState(scenario === "streaming");
  const running = useSyncExternalStore(
    fixture.subscribeRunning,
    fixture.readRunning,
    fixture.readRunning
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
  const question = scenario === "question";
  const webPreview = scenario === "web-preview";
  const [openRequest, setOpenRequest] = useState<Browser.OpenIntent | null>(
    null
  );
  const openWeb = useCallback<Browser.OpenHandler>((intent) => {
    setOpenRequest(intent);
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
    fixture.resetRequests();
    setFixture(new DesktopChatFixture(scenario, queued));
    setStreaming(scenario === "streaming");
    setOpenRequest(null);
  };

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
              {openRequest && (
                <span
                  role="status"
                  className="min-w-0 break-all text-muted-foreground"
                >
                  {openRequest.target === "external"
                    ? "System browser requested for"
                    : "Workbench browser requested for"}{" "}
                  {openRequest.url}
                </span>
              )}
            </>
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
          {(question || scenario === "multiple-questions") && (
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
          {queued && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={running}
                onChange={(event) => fixture.setRunning(event.target.checked)}
              />
              Running turn
            </label>
          )}
          {(scenario === "text" || question) && (
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
          <Button size="sm" variant="ghost" className="ml-auto" onClick={reset}>
            Reset
          </Button>
        </div>
        <div
          className={
            narrow
              ? "flex h-[36rem] w-full max-w-[23rem] flex-col overflow-hidden rounded-xl border bg-background"
              : "flex h-[min(42rem,80vh)] min-h-[36rem] w-full flex-col overflow-hidden rounded-xl border bg-background"
          }
        >
          <BrowserOpen value={webPreview ? openWeb : null}>
            <BrowserPreview value={webPreview ? fixtures.loadWebPreview : null}>
              <NativeAgentPane
                key={fixture.sessionId}
                bridge={fixture.bridge}
                predictionPreferences={
                  scenario === "suggested-prompt"
                    ? suggestionPreferences
                    : undefined
                }
                initialSession={fixture.sessionId}
                editorSurfaces={
                  scenario === "svg-selection"
                    ? fixture.editorSurfaces
                    : undefined
                }
                sideChatPlacement={sideChats}
                libraryRequestSource={
                  scenario === "library-request"
                    ? fixtures.libraryRequestSource
                    : undefined
                }
                subagentPlacement={
                  scenario === "subagents" ? inlineSubagents : undefined
                }
                autofocus={false}
              />
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
