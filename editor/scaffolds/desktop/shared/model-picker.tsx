// GRIDA-GG: desktop — the GG-included picker affordance (docs/wg/platform/hosted-ai.md)
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { GG_PROVIDER_METADATA } from "@grida/agent";
import * as gridaGateway from "@/lib/desktop/gg-session";
import {
  GG_INCLUDED_MODEL_ID,
  resolveDefaultModelId,
  shouldUpgradeToIncluded,
} from "./default-model";
// The default-model constants live in a react-free module so the decision
// is unit-testable in Node; re-exported here to keep the public symbol home.
export { DEFAULT_MODEL_ID } from "./default-model";

const catalog = _models.text.catalog;
type CatalogId = _models.text.CatalogId;

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
  // GRIDA-SEC-006 — hosted-session affordance: a header line stating how
  // the catalog is served (included via the Grida session, or a sign-in
  // hint). Warm on mount so the label is accurate on first open; the
  // catalog itself is NEVER hidden — BYOK keys can still serve it.
  const [gridaGatewayState, setGridaGatewayState] = useState<
    "active" | "signed_out" | "hidden"
  >("hidden");
  useEffect(() => {
    if (!gridaGateway.isSupported()) return;
    let cancelled = false;
    void gridaGateway.ensureFresh().then((state) => {
      if (cancelled) return;
      setGridaGatewayState(
        state.kind === "active"
          ? "active"
          : state.kind === "signed_out" || state.kind === "no_organization"
            ? "signed_out"
            : "hidden"
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
        {gridaGatewayState !== "hidden" && (
          <SelectGroup>
            <SelectSeparator />
            <SelectLabel className="text-[10px] font-normal text-muted-foreground">
              {gridaGatewayState === "active"
                ? GG_PROVIDER_METADATA.included_label
                : "Sign in to use included AI"}
            </SelectLabel>
          </SelectGroup>
        )}
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
 * the welcome handoff carrying the home composer's pick), then re-seeds
 * from a session's stored model whenever the active session id changes —
 * so opening a past chat shows the model it ran with, while a background
 * session-list refresh never clobbers a pick the user just made (the seed
 * fires once per id, not per `sessions` change). When a Grida Gateway
 * session is live and nothing else has claimed the selection, the keyless
 * default is upgraded to the included hosted tier ({@link
 * GG_INCLUDED_MODEL_ID}; issue #942).
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
}): {
  model_id: string;
  setModelId: (id: string) => void;
  /** True once the user has explicitly picked a model in the UI (not a
   *  default or a seed). A producer of a cross-navigation handoff (the
   *  welcome composer) uses this to carry the model ONLY when it was a
   *  deliberate choice — otherwise the destination resolves its own
   *  default, so an unresolved default never masquerades as a pick. */
  is_user_pick: boolean;
} {
  const registeredIds = useMemo(
    () => new Set(registered_models.specs(endpoints).map((m) => m.id)),
    [endpoints]
  );
  const isKnownId = (id: string | undefined | null): id is string =>
    isCatalogId(id) ||
    (typeof id === "string" &&
      (registeredIds.has(id) || AGENT_PROVIDER_IDS.has(id)));

  const [modelId, setModelId] = useState<string>(() =>
    resolveDefaultModelId({
      initial,
      // Synchronous cached GG state: when the session is already known
      // active (warmed by an earlier `ensureFresh`), a keyless surface
      // starts on the included model with no async gap — so an instant
      // first submit can't capture the Claude-Code default before the
      // effect below runs. `peek()` never does IO; the effect still
      // covers a cold cache.
      ggActive: gridaGateway.peek().kind === "active",
      isKnownId,
    })
  );
  // Flipped once the user picks a model in the UI, so the async Grida
  // Gateway upgrade below never clobbers a deliberate choice.
  const userPickedRef = useRef(false);
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

  // GRIDA-SEC-006 / issue #942 — when a Grida Gateway session is live and
  // the user hasn't otherwise chosen a model, upgrade the keyless default
  // to the included hosted tier, so a fresh signed-in, no-BYOK user's first
  // run uses GG instead of hitting the Claude-Code provider's
  // `auth_required`. Session liveness resolves async, so this arrives after
  // mount; `shouldUpgradeToIncluded` reads live refs so an explicit pick, a
  // caller `initial`, or a stored-session seed always wins the race. The
  // catalog itself is never hidden — BYOK can still serve any model.
  useEffect(() => {
    if (!gridaGateway.isSupported()) return;
    let cancelled = false;
    void gridaGateway.ensureFresh().then((state) => {
      if (cancelled || state.kind !== "active") return;
      setModelId((prev) =>
        shouldUpgradeToIncluded({
          current: prev,
          userPicked: userPickedRef.current,
          initialKnown: isKnownId(initial),
          storedSeeded: seededFor.current != null,
        })
          ? GG_INCLUDED_MODEL_ID
          : prev
      );
    });
    return () => {
      cancelled = true;
    };
    // Resolve once on mount; the guard reads live refs, not reactive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wrap the setter so a user's explicit pick marks the selection touched —
  // the async GG upgrade above then leaves it alone. Internal seeding calls
  // the raw `setModelId` (unchanged), so it doesn't trip the flag.
  const pickModel = useCallback((id: string) => {
    userPickedRef.current = true;
    setModelId(id);
  }, []);

  return {
    model_id: modelId,
    setModelId: pickModel,
    is_user_pick: userPickedRef.current,
  };
}
