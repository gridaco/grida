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
import type { ChatSessionRow } from "@/lib/desktop/bridge";

const MODE_LABELS: Record<AgentMode, string> = {
  "accept-edits": "Accept Edits",
  auto: "Auto",
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
        className="min-w-0 gap-1 px-2 text-xs [&>svg]:transition-colors hover:[&>svg]:text-foreground aria-expanded:[&>svg]:text-foreground [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
        aria-label="Mode"
      >
        <PromptInputSelectValue placeholder="Mode" />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {AGENT_MODES.map((m) => (
          <PromptInputSelectItem key={m} value={m} className="text-xs">
            {MODE_LABELS[m]}
          </PromptInputSelectItem>
        ))}
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
