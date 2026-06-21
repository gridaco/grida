/**
 * Desktop model picker — every catalog model grouped by provider, plus
 * the Claude Code agent-provider options (issue #813) and any user-
 * registered endpoint models (issue #806 — local Ollama, self-hosted
 * gateways).
 *
 * The agent system is tier-based (4 tiers → 4 models), but the catalog
 * holds more models than the tiers map to, leaving some unreachable.
 * This picker lists them all so a desktop user can run any specific
 * model; the chosen id rides the `modelId` field end-to-end (renderer →
 * agent sidecar → model factory) and overrides the tier→model mapping for that
 * turn. See `@grida/agent`'s `AgentRunOptions.modelId`.
 */

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";
import {
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
} from "@app/ui/ai-elements/prompt-input";
// Grouping primitives — the prompt-input select doesn't re-export these.
import {
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@app/ui/components/select";
// Pull the catalog from the framework-free `@grida/ai-models` package,
// NOT the editor's `@/lib/ai/models` seam — that seam constructs server
// providers (live keys) and is lint-blocked from the desktop renderer
// (GRIDA-SEC-004). This package is pure data and renderer-safe.
import _models from "@grida/ai-models";
import type {
  ChatSessionRow,
  EndpointProviderConfig,
} from "@/lib/desktop/bridge";
import { registered_models } from "./registered-models";

const catalog = _models.text.catalog;
type CatalogId = _models.text.CatalogId;

/**
 * Default selection — Claude Code on Opus 4.8 (1M), the user's own Claude
 * subscription (issue #813): zero key, the largest context, the path we want
 * users to land on. NOTE: assumes the user is logged in to Claude — a
 * no-Claude fallback wants the zero-config auto-detect (see
 * `docs/wg/ai/agent/acp-provider.plan.md`); until then a signed-out user's
 * first run hits `auth_required`. Revert to `TIER_MODEL_IDS.pro` (hosted
 * Sonnet 4.6) for a catalog default.
 */
export const DEFAULT_MODEL_ID: string = "claude-code/opus-4.8-1m";

const MODEL_OPTIONS = Object.values(catalog);

/**
 * Agent-provider options (issue #813): synthetic ids that route a run to an
 * EXTERNAL agent owning its own loop (e.g. Claude Code) on the USER'S OWN
 * subscription — not a catalog model. Keep these ids in sync with
 * `AGENT_PROVIDER_MODELS` in
 * `packages/grida-ai-agent/src/agent-provider/types.ts`. (Hardcoded, not
 * imported: that module is node-only and would break the renderer bundle.)
 */
const AGENT_PROVIDER_OPTIONS = [
  // Opus 4.8 is the 1M-context variant (the synthetic id keeps the `-1m` tag;
  // the label hides it). The smaller-context build isn't surfaced.
  { id: "claude-code/opus-4.8-1m", label: "Opus 4.8" },
  { id: "claude-code/sonnet-4.6", label: "Sonnet 4.6" },
  { id: "claude-code/haiku-4.5", label: "Haiku 4.5" },
] as const;
const AGENT_PROVIDER_IDS = new Set<string>([
  ...AGENT_PROVIDER_OPTIONS.map((o) => o.id),
  // Legacy bare id (runtime back-compat in `AGENT_PROVIDER_MODELS`): keep a
  // session stored with it recognized so it re-seeds + runs instead of being
  // clobbered to the default.
  "claude-code",
]);

function isCatalogId(id: string | undefined | null): id is CatalogId {
  return typeof id === "string" && Object.hasOwn(catalog, id);
}

// Group the flat catalog by provider for the picker. Vendor is the `vendor/`
// id prefix (e.g. `anthropic/claude-opus-4.8`); Anthropic is surfaced first.
type CatalogSpec = (typeof MODEL_OPTIONS)[number];
const VENDOR_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};
function vendorOf(id: string): string {
  const slash = id.indexOf("/");
  return slash > 0 ? id.slice(0, slash) : "other";
}
function vendorLabel(vendor: string): string {
  return VENDOR_LABELS[vendor] ?? vendor.replace(/^\w/, (c) => c.toUpperCase());
}
const CATALOG_GROUPS: {
  vendor: string;
  label: string;
  models: CatalogSpec[];
}[] = (() => {
  const groups = new Map<string, CatalogSpec[]>();
  for (const m of MODEL_OPTIONS) {
    const v = vendorOf(m.id);
    const arr = groups.get(v);
    if (arr) arr.push(m);
    else groups.set(v, [m]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === "anthropic" ? -1 : b === "anthropic" ? 1 : a.localeCompare(b)
    )
    .map(([vendor, models]) => ({
      vendor,
      label: vendorLabel(vendor),
      models,
    }));
})();

export function DesktopModelPicker({
  value,
  onValueChange,
  endpoints = [],
}: {
  value: string;
  onValueChange: (modelId: string) => void;
  /** Configured endpoint providers whose registered models join the list
   *  (grouped under the endpoint's label). */
  endpoints?: readonly EndpointProviderConfig[];
}) {
  return (
    <PromptInputSelect value={value} onValueChange={onValueChange}>
      <PromptInputSelectTrigger
        size="sm"
        className="min-w-0 gap-1 px-2 text-xs [&>svg]:transition-colors hover:[&>svg]:text-foreground aria-expanded:[&>svg]:text-foreground [&_[data-slot=select-value]]:block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate"
        aria-label="Model"
      >
        <PromptInputSelectValue placeholder="Model" />
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {/* Claude Code — external agent on the user's own subscription (#813) */}
        <SelectGroup>
          <SelectLabel>Claude Code</SelectLabel>
          {AGENT_PROVIDER_OPTIONS.map((o) => (
            <PromptInputSelectItem key={o.id} value={o.id} className="text-xs">
              {o.label}
            </PromptInputSelectItem>
          ))}
        </SelectGroup>
        {/* Hosted catalog, grouped by provider (Anthropic first) */}
        {CATALOG_GROUPS.map((group) => (
          <SelectGroup key={group.vendor}>
            <SelectSeparator />
            <SelectLabel>{group.label}</SelectLabel>
            {group.models.map((m) => (
              <PromptInputSelectItem
                key={m.id}
                value={m.id}
                className="text-xs"
              >
                {_models.text.displayLabel(m)}
              </PromptInputSelectItem>
            ))}
          </SelectGroup>
        ))}
        {/* User-configured endpoints (Ollama, self-hosted gateways) */}
        {endpoints.map((endpoint) => (
          <SelectGroup key={endpoint.id}>
            <SelectSeparator />
            <SelectLabel>{endpoint.label ?? endpoint.id}</SelectLabel>
            {endpoint.models.map((m) => (
              <PromptInputSelectItem
                key={`${endpoint.id}/${m.id}`}
                value={m.id}
                className="text-xs"
              >
                {m.label ?? m.id}
              </PromptInputSelectItem>
            ))}
          </SelectGroup>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

/**
 * Inline notice for a selected model that is marked `tool_call: false`
 * (issue #806). The agent loop is tool-heavy (files, commands, todos) —
 * gating is deliberately permissive (the run is not blocked), so the
 * honest move is a visible expectation-setter, not a hard stop.
 */
export function ModelToolCallNotice({
  model_id: modelId,
  endpoints,
}: {
  model_id: string;
  endpoints: readonly EndpointProviderConfig[];
}) {
  // Memoized: this renders inside chat panels that re-render per streamed
  // token, and resolve() rebuilds the flattened spec list each call.
  const spec = useMemo(
    () => registered_models.resolve(modelId, endpoints),
    [modelId, endpoints]
  );
  if (!spec || spec.tool_call) return null;
  return (
    <div className="flex items-start gap-2 border-t bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
      <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        {spec.label} is marked as not supporting tool calls — the agent&apos;s
        file, command, and planning abilities may not work with it.
      </span>
    </div>
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
  endpoints = [],
}: {
  current_id: string | null;
  sessions: ChatSessionRow[];
  /** Initial selection, applied only on first mount. Falls back to
   * {@link DEFAULT_MODEL_ID} when absent or not a known model id. */
  initial?: string;
  /** Configured endpoint providers — their registered model ids count as
   *  known, so a session that ran on a local model re-seeds correctly. */
  endpoints?: readonly EndpointProviderConfig[];
}): { model_id: string; setModelId: (id: string) => void } {
  const registeredIds = useMemo(
    () => new Set(registered_models.specs(endpoints).map((m) => m.id)),
    [endpoints]
  );
  const isKnownId = (id: string | undefined | null): id is string =>
    isCatalogId(id) ||
    (typeof id === "string" &&
      (registeredIds.has(id) || AGENT_PROVIDER_IDS.has(id)));

  const [modelId, setModelId] = useState<string>(
    isKnownId(initial) ? initial : DEFAULT_MODEL_ID
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
    if (isKnownId(stored)) {
      setModelId(stored);
      seededFor.current = currentId;
      return;
    }
    // Stored id not (yet) known. Endpoints load async — when the session
    // ran on a registered local model, leave the seed open so the
    // `registeredIds` dep can complete it once the endpoint list lands.
    // A session with NO stored model is seeded-done immediately.
    if (!stored) seededFor.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, sessions, registeredIds]);

  return { model_id: modelId, setModelId };
}
