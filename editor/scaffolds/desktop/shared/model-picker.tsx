/**
 * Desktop model picker — flat list of every catalog model.
 *
 * The agent system is tier-based (4 tiers → 4 models), but the catalog
 * holds more models than the tiers map to, leaving some unreachable.
 * This picker lists them all so a desktop user can run any specific
 * model; the chosen id rides the `modelId` field end-to-end (renderer →
 * agent sidecar → model factory) and overrides the tier→model mapping for that
 * turn. See `@grida/agent`'s `AgentRunOptions.modelId`.
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
// Pull the catalog from the framework-free `@grida/ai-models` package,
// NOT the editor's `@/lib/ai/models` seam — that seam constructs server
// providers (live keys) and is lint-blocked from the desktop renderer
// (GRIDA-SEC-004). This package is pure data and renderer-safe.
import _models, { TIER_MODEL_IDS } from "@grida/ai-models";
import type { ChatSessionRow } from "@/lib/desktop/bridge";

const catalog = _models.text.catalog;
type CatalogId = _models.text.CatalogId;

/** Default selection — the "pro" tier's model (Claude Sonnet 4.6). */
export const DEFAULT_MODEL_ID: string = TIER_MODEL_IDS.pro;

const MODEL_OPTIONS = Object.values(catalog);

function isCatalogId(id: string | undefined | null): id is CatalogId {
  return typeof id === "string" && Object.hasOwn(catalog, id);
}

export function DesktopModelPicker({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (modelId: string) => void;
}) {
  return (
    <PromptInputSelect value={value} onValueChange={onValueChange}>
      <PromptInputSelectTrigger
        size="sm"
        className="text-xs"
        aria-label="Model"
      >
        <PromptInputSelectValue placeholder="Model" />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {MODEL_OPTIONS.map((m) => (
          <PromptInputSelectItem key={m.id} value={m.id} className="text-xs">
            {m.label}
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

/**
 * Model selection state for a chat panel. Defaults to
 * {@link DEFAULT_MODEL_ID} (or `initial`, when a caller seeds one — e.g.
 * the welcome handoff carrying the home composer's pick) and re-seeds
 * from a session's stored model whenever the active session id changes —
 * so opening a past chat shows the model it ran with, while a background
 * session-list refresh never clobbers a pick the user just made (the seed
 * fires once per id, not per `sessions` change).
 */
export function useModelPickerState({
  current_id: currentId,
  sessions,
  initial,
}: {
  current_id: string | null;
  sessions: ChatSessionRow[];
  /** Initial selection, applied only on first mount. Falls back to
   * {@link DEFAULT_MODEL_ID} when absent or not a known catalog id. */
  initial?: string;
}): { model_id: string; setModelId: (id: string) => void } {
  const [modelId, setModelId] = useState<string>(
    isCatalogId(initial) ? initial : DEFAULT_MODEL_ID
  );
  // The session id we last seeded from. Re-seed only when the active id
  // changes — `undefined` means "never seeded" so the first run fires.
  const seededFor = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (seededFor.current === currentId) return;
    // New chat (null): carry the current pick forward into it.
    if (currentId === null) {
      seededFor.current = null;
      return;
    }
    const row = sessions.find((s) => s.id === currentId);
    // Row not in the list yet (still loading) — wait for it before
    // committing, so we don't lock in the default and skip the real seed.
    if (!row) return;
    const stored = row.model?.model_id;
    if (isCatalogId(stored)) setModelId(stored);
    seededFor.current = currentId;
  }, [currentId, sessions]);

  return { model_id: modelId, setModelId };
}
