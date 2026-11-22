"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import { MicIcon, SettingsIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@app/ui/components/button";
import { LiveWaveform } from "@app/ui/components/live-waveform";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerToolbarTooltip,
  composerToolbarButtonClassName,
  type Dictation,
} from "@/kits/composer";
import { app } from "@/lib/desktop/bridge";
import { ComposerVoice } from "./composer-voice";

const dictateButtonClass = cn(composerToolbarButtonClassName, "w-7 shrink-0");

export const ComposerVoiceHostContext =
  createContext<ComposerVoice.Host | null>(null);

export function useComposerVoice(defaultHost?: ComposerVoice.Host) {
  const host = useContext(ComposerVoiceHostContext) ?? defaultHost;
  const voice = useMemo(() => new ComposerVoice(host), [host]);
  const state = useSyncExternalStore(
    voice.subscribe,
    voice.getSnapshot,
    voice.getServerSnapshot
  );
  useEffect(() => {
    if (host) return voice.connect();
  }, [host, voice]);
  return { voice, state };
}

export function DictationButton({
  label,
  escapeShortcut,
  className,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
  escapeShortcut?: boolean;
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
        className={cn(dictateButtonClass, className)}
        aria-label={label}
        aria-keyshortcuts={escapeShortcut ? "Escape" : undefined}
        {...props}
      />
    </ComposerToolbarTooltip>
  );
}

export function DictationActivity({
  state,
  cancel,
}: {
  state: Dictation.State | null;
  cancel(): void;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pe-2">
      <DictationButton label="Cancel dictation" onClick={cancel}>
        <XIcon aria-hidden="true" className="size-4" />
      </DictationButton>
      <span role="status" className="sr-only">
        {state?.phase === "recording"
          ? "Listening…"
          : state?.phase === "finishing"
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
  );
}

export function openVoiceSettings() {
  void app.openSettings("voice").catch(() => {
    toast.error("Couldn’t open Voice settings.");
  });
}

/** The mic opens Voice Settings while audio capture is unavailable. */
export function DictationSetupButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(dictateButtonClass, "text-muted-foreground/60")}
            aria-label={label}
            onClick={openVoiceSettings}
          >
            <MicIcon aria-hidden="true" className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent
          aria-label={label}
          side="top"
          sideOffset={4}
          className="p-0"
        >
          <button
            type="button"
            tabIndex={-1}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 hover:bg-background/10"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setOpen(false);
              openVoiceSettings();
            }}
          >
            {label}
            <SettingsIcon aria-hidden="true" className="size-3.5" />
          </button>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
