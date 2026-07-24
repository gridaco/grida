/**
 * Desktop permission-mode picker (RFC `permission modes`).
 *
 * Two exposed modes — `accept-edits` (supervised, the default) and `auto`
 * (trusted bypass). The chosen mode rides the `mode` field end-to-end
 * (renderer → agent sidecar → shell gate) and is persisted on the session.
 * Sibling to `model-picker.tsx`; same neutral select chrome, same
 * seed-once-per-session-id discipline.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@app/ui/ai-elements/prompt-input";
import {
  AGENT_MODES,
  AGENT_DEFAULT_MODE,
  asAgentMode,
  type AgentMode,
} from "@grida/agent";
import { HandIcon, ShieldCheckIcon, type LucideIcon } from "lucide-react";
import type { ChatSessionRow } from "@/lib/desktop/bridge";

const MODE_OPTIONS: Record<
  AgentMode,
  {
    label: string;
    description: string;
    icon: LucideIcon;
  }
> = {
  "accept-edits": {
    label: "Accept Edits",
    description:
      "Reads and edits files automatically; asks before commands that may make changes.",
    icon: HandIcon,
  },
  auto: {
    label: "Auto",
    description:
      "Runs all commands without asking; workspace access remains sandboxed.",
    icon: ShieldCheckIcon,
  },
};

export function DesktopModePicker({
  value,
  onValueChange,
}: {
  value: AgentMode;
  onValueChange: (mode: AgentMode) => void;
}) {
  return (
    <PromptInputSelect
      value={value}
      onValueChange={(v) => onValueChange(v as AgentMode)}
    >
      <PromptInputSelectTrigger
        size="sm"
        className="min-w-0 px-2 text-xs [&>svg]:hidden [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
        aria-label="Mode"
      >
        <PromptInputSelectValue>
          {MODE_OPTIONS[value].label}
        </PromptInputSelectValue>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent className="w-80 max-w-[calc(100vw-1rem)]">
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          How should agent actions be approved?
        </div>
        {AGENT_MODES.map((mode) => {
          const option = MODE_OPTIONS[mode];
          const Icon = option.icon;
          return (
            <PromptInputSelectItem
              key={mode}
              value={mode}
              textValue={option.label}
              className="items-start py-2.5 [&>span:last-child]:items-start"
            >
              <Icon className="mt-0.5 size-4" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug whitespace-normal text-muted-foreground">
                  {option.description}
                </span>
              </span>
            </PromptInputSelectItem>
          );
        })}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

/**
 * Mode selection state for a chat panel. Defaults to {@link AGENT_DEFAULT_MODE}
 * (or `initial` when a caller seeds one) and re-seeds from a session's stored
 * mode whenever the active session id changes — so opening a past chat shows
 * the mode it ran with, while a background session-list refresh never clobbers
 * a pick the user just made.
 */
export function useModePickerState({
  current_id: currentId,
  sessions,
  initial,
}: {
  current_id: string | null;
  sessions: ChatSessionRow[];
  initial?: AgentMode;
}): { mode: AgentMode; setMode: (mode: AgentMode) => void } {
  const [mode, setMode] = useState<AgentMode>(
    asAgentMode(initial) ?? AGENT_DEFAULT_MODE
  );
  const seededFor = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (seededFor.current === currentId) return;
    if (currentId === null) {
      seededFor.current = null;
      return;
    }
    const row = sessions.find((s) => s.id === currentId);
    if (!row) return;
    const rowMode = asAgentMode(row.mode);
    if (rowMode) setMode(rowMode);
    seededFor.current = currentId;
  }, [currentId, sessions]);

  return { mode, setMode };
}
