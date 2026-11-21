"use client";

import { Button } from "@app/ui/components/button";
import { LiveWaveform } from "@app/ui/components/live-waveform";
import { LoaderCircleIcon, MicIcon, SquareIcon, XIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  ComposerToolbarTooltip,
  Dictation,
  composerToolbarButtonClassName,
  type ComposerController,
} from "@/kits/composer";
import { ComposerDrafts } from "@/lib/agent-chat/composer-drafts";
import { AgentComposerInput } from "@/scaffolds/desktop/shared/agent-composer-input";
import { cn } from "@app/ui/lib/utils";
import { DictationDemoSources } from "./dictation-demo-sources";
import styles from "./dictate-demo.module.css";

const catalog = { commands: [], mentions: [] };
type Example = "empty" | "existing";

export function DictateDemo() {
  const [activeExample, setActiveExample] = useState<Example | null>(null);
  const [dictation] = useState(
    () => new Dictation(DictationDemoSources.openMicrophone)
  );
  const state = useSyncExternalStore(
    dictation.subscribe,
    dictation.getSnapshot,
    dictation.getSnapshot
  );
  useEffect(() => () => dictation.cancel(), [dictation]);

  const startDictation = (example: Example, onFallback: () => void) => {
    setActiveExample(example);
    return dictation.start(
      DictationDemoSources.webSpeechWithSample(onFallback)
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Speak and press Stop to add your words to the draft. Live recognition
        may send audio to your browser’s speech service.
      </p>
      <DictateExample
        example="empty"
        state={activeExample === "empty" ? state : null}
        dictation={dictation}
        startDictation={startDictation}
      />
      <DictateExample
        example="existing"
        initialText="Turn these notes into a presentation for the team."
        state={activeExample === "existing" ? state : null}
        dictation={dictation}
        startDictation={startDictation}
      />
    </div>
  );
}

function DictateExample({
  example,
  initialText,
  state,
  dictation,
  startDictation,
}: {
  example: Example;
  initialText?: string;
  state: Dictation.State | null;
  dictation: Dictation;
  startDictation(
    example: Example,
    onFallback: () => void
  ): Promise<string | null>;
}) {
  const id = `dictate-${example}`;
  const [store] = useState(() => {
    const draftStore = new ComposerDrafts(null, null);
    if (initialText) {
      draftStore.write(id, {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: initialText }],
          },
        ],
      });
    }
    return draftStore;
  });
  const draft = useRef<Pick<ComposerController, "appendText" | "focus">>(null);
  const [compact, setCompact] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const phase = state?.phase ?? "idle";
  const active =
    phase === "starting" || phase === "recording" || phase === "finishing";

  const start = async (event: MouseEvent<HTMLButtonElement>) => {
    const empty = store.read(id) === null;
    setCompact(empty);
    setNotice(null);
    if (empty) event.currentTarget.focus();
    else if (event.detail > 0) draft.current?.focus();

    const text = await startDictation(example, () => {
      setNotice("Live recognition is unavailable. Using a sample transcript.");
    });
    if (text === null) return;
    if (text && draft.current?.appendText(text, Infinity)) return;
    setNotice(
      text ? "Couldn’t insert the transcript." : "No speech was recognized."
    );
    draft.current?.focus();
  };

  const cancel = () => {
    dictation.cancel();
    setNotice(null);
    draft.current?.focus();
  };

  const stop = () => {
    dictation.stop();
    if (phase === "starting") draft.current?.focus();
  };

  const handleShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !active ||
      event.key !== "Escape" ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !(event.target instanceof Element) ||
      !event.currentTarget.contains(event.target) ||
      event.target.closest("[data-composer-formatting], [aria-expanded='true']")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) stop();
  };

  return (
    <section
      aria-labelledby={id}
      className="space-y-2"
      onKeyDownCapture={handleShortcut}
    >
      <h3 id={id} className="text-sm font-medium">
        {example === "empty" ? "Empty draft" : "Existing draft"}
      </h3>
      <AgentComposerInput
        catalog={catalog}
        draft={{ key: id, store }}
        draftRef={draft}
        isStreaming={false}
        canSubmit={false}
        onSubmit={() => {}}
        onStop={() => {}}
        className={cn(styles.composer, active && compact && styles.compact)}
        toolbarStart={
          active && (
            <div className="flex min-w-0 flex-1 items-center gap-2 pe-2">
              <DictateButton label="Cancel dictation" onClick={cancel}>
                <XIcon aria-hidden="true" className="size-4" />
              </DictateButton>
              <span role="status" className="sr-only">
                {phase === "recording"
                  ? "Listening…"
                  : phase === "finishing"
                    ? "Transcribing…"
                    : "Waiting for microphone…"}
              </span>
              <div
                aria-hidden="true"
                className="relative h-6 min-w-0 flex-1 mask-[linear-gradient(to_right,transparent,black_7%,black_93%,transparent)]"
              >
                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 bg-[radial-gradient(circle_at_center,currentColor_0.75px,transparent_1px)] bg-size-[5px_100%] text-muted-foreground/20" />
                {state?.phase === "recording" && (
                  <LiveWaveform
                    active
                    stream={state.stream}
                    mode="scrolling"
                    height={24}
                    barWidth={2}
                    barGap={3}
                    barHeight={1.5}
                    barRadius={1}
                    historySize={256}
                    sensitivity={8}
                    updateRate={40}
                    fadeEdges={false}
                    className="absolute inset-0 text-muted-foreground/75"
                  />
                )}
              </div>
            </div>
          )
        }
        toolbarEnd={
          active ? (
            <DictateButton
              label={phase === "finishing" ? "Transcribing…" : "Stop dictation"}
              onClick={stop}
              escapeShortcut={phase !== "finishing"}
              disabled={phase === "finishing"}
            >
              {phase === "finishing" ? (
                <LoaderCircleIcon
                  aria-hidden="true"
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              ) : (
                <SquareIcon
                  aria-hidden="true"
                  className="size-3 fill-current"
                />
              )}
            </DictateButton>
          ) : (
            <DictateButton label="Dictate" onClick={start}>
              <MicIcon aria-hidden="true" className="size-4" />
            </DictateButton>
          )
        }
      />
      {state?.phase === "error" && (
        <p role="alert" className="text-sm text-muted-foreground">
          {state.error.name === "NotAllowedError"
            ? "Allow microphone access in your browser to try again."
            : state.error.message}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}

function DictateButton({
  label,
  onClick,
  escapeShortcut,
  disabled,
  children,
}: {
  label: string;
  onClick(event: MouseEvent<HTMLButtonElement>): void;
  escapeShortcut?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <ComposerToolbarTooltip
      label={label}
      shortcut={escapeShortcut ? "Esc" : undefined}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className={cn(composerToolbarButtonClassName, "w-7")}
        aria-label={label}
        aria-keyshortcuts={escapeShortcut ? "Escape" : undefined}
        disabled={disabled}
        onClick={onClick}
      >
        {children}
      </Button>
    </ComposerToolbarTooltip>
  );
}
