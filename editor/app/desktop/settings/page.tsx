"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import { Switch } from "@app/ui/components/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Skeleton } from "@app/ui/components/skeleton";
import {
  BYOK_PROVIDER_LABELS,
  DesktopBridgeMissingError,
  OLLAMA_ENDPOINT_PRESET,
  app,
  mergeProbedModels,
  providers,
  resolveEndpointModel,
  secrets,
  type ByokProviderId,
  type EndpointModelEntry,
  type EndpointProviderConfig,
} from "@/lib/desktop/bridge";
import {
  DesktopPageContent,
  DesktopPageShell,
} from "@/scaffolds/desktop/chrome/page-shell";

/**
 * Desktop settings — BYOK key slots, version/platform.
 *
 * The page is mounted under `editor/app/desktop/layout.tsx` which
 * gates on `DesktopBridgeGate`; by the time this renders the bridge
 * exists. We don't double-gate.
 *
 * Everything routes through the typed namespaces (`secrets`, `app`) on
 * `@/lib/desktop/bridge` rather than `window.grida` directly,
 * per GRIDA-SEC-004. The bridge intentionally has no `secrets.get` —
 * the renderer can only check presence, set, or delete. The UI mirrors
 * that constraint: a configured slot is replaced by a "Remove" button,
 * never by the key value.
 */

export default function DesktopSettingsPage() {
  return (
    <DesktopPageShell>
      <DesktopPageContent className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI provider keys, local models, and app info.
          </p>
        </header>

        <ByokSection />
        <LocalModelsSection />
        <AboutSection />
      </DesktopPageContent>
    </DesktopPageShell>
  );
}

/* ────────────────────────────── BYOK ─────────────────────────────── */

function ByokSection() {
  const providers = secrets.byokProviderMetadata();
  const precedence = providers.map((provider) => provider.label).join(" → ");
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider Keys</CardTitle>
        <CardDescription>
          V1 agent runs require a BYOK key. Provider precedence: {precedence}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {providers.map((provider) => (
          <ByokRow key={provider.id} providerId={provider.id} />
        ))}
      </CardContent>
    </Card>
  );
}

type RowState =
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "configured" }
  | { kind: "saving" }
  | { kind: "removing" }
  | { kind: "error"; message: string; previous: "empty" | "configured" };

function ByokRow({ providerId }: { providerId: ByokProviderId }) {
  const label = BYOK_PROVIDER_LABELS[providerId];
  const [state, setState] = useState<RowState>({ kind: "loading" });
  const [value, setValue] = useState("");

  const refresh = useCallback(async () => {
    try {
      const present = await secrets.hasKey(providerId);
      setState({ kind: present ? "configured" : "empty" });
    } catch (err) {
      // If the bridge vanishes (shouldn't happen mid-session), keep
      // the row locked in error state rather than flickering.
      setState({
        kind: "error",
        message: describeError(err),
        previous: "empty",
      });
    }
  }, [providerId]);

  // Initial fetch on mount. The loading skeleton prevents the
  // "Not configured" → "Configured" flash the prompt calls out.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSave = useCallback(async () => {
    if (value.trim().length === 0) {
      setState({
        kind: "error",
        message: "Key cannot be empty.",
        previous: "empty",
      });
      return;
    }
    setState({ kind: "saving" });
    try {
      await secrets.setKey(providerId, value);
      setValue("");
      await refresh();
    } catch (err) {
      setValue("");
      setState({
        kind: "error",
        message: describeError(err),
        previous: "empty",
      });
    }
  }, [providerId, value, refresh]);

  const handleRemove = useCallback(async () => {
    let confirmed = false;
    try {
      confirmed = await secrets.confirmDeleteKey(providerId);
    } catch (err) {
      setState({
        kind: "error",
        message: describeError(err),
        previous: "configured",
      });
      return;
    }
    if (!confirmed) return;

    setState({ kind: "removing" });
    try {
      await secrets.deleteKey(providerId);
      await refresh();
    } catch (err) {
      setState({
        kind: "error",
        message: describeError(err),
        previous: "configured",
      });
    }
  }, [providerId, refresh]);

  const handleErrorDismiss = useCallback(() => {
    void refresh();
  }, [refresh]);

  // Status pill — driven by the "stable" facet of state. Saving /
  // removing keep the pill at the previous state so the user has a
  // continuous visual anchor while the request is in flight.
  const statusKind = stableKind(state);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <StatusPill kind={statusKind} />
      </div>

      {state.kind === "loading" ? (
        <Skeleton className="h-9 w-full" />
      ) : statusKind === "configured" ? (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            disabled={state.kind === "removing"}
            onClick={() => void handleRemove()}
          >
            {state.kind === "removing" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Remove
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={`Paste your ${label} key`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={state.kind === "saving"}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            size="default"
            disabled={state.kind === "saving" || value.trim().length === 0}
            onClick={() => void handleSave()}
          >
            {state.kind === "saving" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Save
          </Button>
        </div>
      )}

      {state.kind === "error" && (
        <button
          type="button"
          role="alert"
          aria-live="polite"
          onClick={handleErrorDismiss}
          className="self-start text-left text-sm text-destructive underline-offset-4 hover:underline"
        >
          {state.message} (click to retry)
        </button>
      )}
    </div>
  );
}

function stableKind(state: RowState): "loading" | "empty" | "configured" {
  switch (state.kind) {
    case "loading":
      return "loading";
    case "empty":
    case "saving":
      return "empty";
    case "configured":
    case "removing":
      return "configured";
    case "error":
      return state.previous;
  }
}

function StatusPill({ kind }: { kind: "loading" | "empty" | "configured" }) {
  if (kind === "loading") {
    return <Skeleton className="h-4 w-24" />;
  }
  if (kind === "configured") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span
          aria-hidden="true"
          className="size-2 rounded-full bg-emerald-500"
        />
        Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-2 rounded-full bg-muted-foreground/40"
      />
      Not configured
    </span>
  );
}

/* ─────────────────────────── Local models ───────────────────────── */

/**
 * Endpoint provider config (issue #806) — the Ollama preset slot. The
 * agent host persists configs in `endpoints.json` (plain config, not a
 * secret; the bridge may read them back, unlike keys).
 *
 * The section edits a local draft and persists on Save — endpoint config
 * is structural (base URL + model list), so field-level autosave would
 * fire half-formed configs at the host validator.
 */

type LocalState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "ready"; draft: EndpointProviderConfig | null; dirty: boolean }
  | { kind: "saving"; draft: EndpointProviderConfig | null }
  | { kind: "error"; message: string; draft: EndpointProviderConfig | null };

function LocalModelsSection() {
  const [state, setState] = useState<LocalState>({ kind: "loading" });
  const [newModelId, setNewModelId] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeNote, setProbeNote] = useState<string | null>(null);

  /**
   * Discover the endpoint's models (agent-host-side fetch of Ollama's
   * `/api/tags` + `/api/ps`/`/api/show`, or a generic `/models`) and
   * refresh the DETECTED fields. Detection owns the top-level
   * `tool_call`/`contextWindow` on each entry — the probe overwrites
   * them freely; human corrections live in `overrides` (hand-edited
   * JSON, or the inputs shown when detection has nothing) and are never
   * touched here.
   *
   * `persist: true` (an already-saved config) writes the refreshed
   * config straight back — detected facts aren't a user choice, so they
   * don't sit in an unsaved draft. The setup flow passes `false` and
   * keeps the explicit Save.
   */
  const detectInto = useCallback(
    async (base: EndpointProviderConfig, opts: { persist: boolean }) => {
      setProbing(true);
      setProbeNote(null);
      try {
        const result = await providers.probeEndpoint(base.base_url);
        const merged = mergeProbedModels(base.models, result.models);
        setProbeNote(
          merged.discovered > 0
            ? `Found ${merged.discovered} model${merged.discovered === 1 ? "" : "s"}.`
            : merged.updated > 0
              ? "Updated model details."
              : "No new models found."
        );
        if (merged.discovered === 0 && merged.updated === 0) return;
        const next = { ...base, models: merged.models };
        if (opts.persist) {
          await providers.setEndpoint(next);
          setState({ kind: "ready", draft: next, dirty: false });
        } else {
          setState({ kind: "ready", draft: next, dirty: true });
        }
      } catch (err) {
        setProbeNote(
          `Couldn't reach the endpoint (${describeError(err)}) — add models manually.`
        );
      } finally {
        setProbing(false);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!providers.isSupported()) {
      setState({ kind: "unsupported" });
      return;
    }
    try {
      const list = await providers.listEndpoints();
      const ollama = list.find((e) => e.id === OLLAMA_ENDPOINT_PRESET.id);
      setState({ kind: "ready", draft: ollama ?? null, dirty: false });
      // Detected values converge to the server's truth on every visit —
      // notably /api/ps starts reporting a model's REAL allocation once
      // it has been loaded. Fire-and-forget; failures only leave a note.
      if (ollama) void detectInto(ollama, { persist: true });
    } catch (err) {
      setState({ kind: "error", message: describeError(err), draft: null });
    }
  }, [detectInto]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const draft = "draft" in state ? state.draft : null;

  const edit = useCallback((next: EndpointProviderConfig) => {
    setState({ kind: "ready", draft: next, dirty: true });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setState({ kind: "saving", draft });
    try {
      await providers.setEndpoint(draft);
      const list = await providers.listEndpoints();
      const saved = list.find((e) => e.id === OLLAMA_ENDPOINT_PRESET.id);
      setState({ kind: "ready", draft: saved ?? null, dirty: false });
    } catch (err) {
      setState({ kind: "error", message: describeError(err), draft });
    }
  }, [draft]);

  const handleEnable = useCallback(() => {
    const base: EndpointProviderConfig = {
      ...OLLAMA_ENDPOINT_PRESET,
      models: [],
    };
    setState({ kind: "ready", draft: base, dirty: true });
    // Prefill from the running Ollama right away — the common path is
    // "models already pulled; nothing to type". Not persisted until the
    // user confirms with Save (the config doesn't exist yet).
    void detectInto(base, { persist: false });
  }, [detectInto]);

  const handleRemove = useCallback(async () => {
    if (!draft) return;
    let confirmed = false;
    try {
      confirmed = await providers.confirmDeleteEndpoint(
        draft.label ?? draft.id
      );
    } catch (err) {
      setState({ kind: "error", message: describeError(err), draft });
      return;
    }
    if (!confirmed) return;
    setState({ kind: "saving", draft });
    try {
      await providers.deleteEndpoint(draft.id);
      await refresh();
    } catch (err) {
      setState({ kind: "error", message: describeError(err), draft });
    }
  }, [draft, refresh]);

  const addModel = useCallback(() => {
    if (!draft) return;
    const id = newModelId.trim();
    if (!id || draft.models.some((m) => m.id === id)) return;
    edit({ ...draft, models: [...draft.models, { id }] });
    setNewModelId("");
  }, [draft, newModelId, edit]);

  const saveDisabled =
    state.kind !== "ready" ||
    !state.dirty ||
    !draft ||
    draft.base_url.trim().length === 0;

  // Old desktop binaries have no bridge surface for this — hide rather
  // than render a dead section.
  if (state.kind === "unsupported") return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local Models</CardTitle>
        <CardDescription>
          Run the agent on your own machine with{" "}
          <a
            className="underline underline-offset-4"
            href="https://ollama.com"
            target="_blank"
            rel="noreferrer"
          >
            Ollama
          </a>{" "}
          — no account, no API key. Start <code>ollama serve</code> and pull a
          model; Grida detects it automatically. Local models vary widely in
          agent ability; larger models (~30B+) are recommended for agent tasks.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.kind === "loading" ? (
          <Skeleton className="h-9 w-full" />
        ) : !draft ? (
          <div className="flex justify-start">
            <Button variant="outline" onClick={handleEnable}>
              Set up Ollama
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Base URL</Label>
              <Input
                value={draft.base_url}
                onChange={(e) => edit({ ...draft, base_url: e.target.value })}
                placeholder={OLLAMA_ENDPOINT_PRESET.base_url}
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Models</Label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={probing || state.kind === "saving"}
                  onClick={() => void detectInto(draft, { persist: false })}
                >
                  {probing ? <Loader2 className="size-4 animate-spin" /> : null}
                  Detect
                </Button>
              </div>
              {probeNote && (
                <p className="text-xs text-muted-foreground" role="status">
                  {probeNote}
                </p>
              )}
              {draft.models.length === 0 && !probing && (
                <p className="text-xs text-muted-foreground">
                  Models you pulled in Ollama are detected automatically — or
                  add one by id (e.g. <code>llama3.1:8b</code>). The first model
                  is the default.
                </p>
              )}
              {draft.models.map((model, index) => (
                <LocalModelRow
                  key={model.id}
                  model={model}
                  onChange={(next) =>
                    edit({
                      ...draft,
                      models: draft.models.map((m, i) =>
                        i === index ? next : m
                      ),
                    })
                  }
                  onRemove={() =>
                    edit({
                      ...draft,
                      models: draft.models.filter((_, i) => i !== index),
                      default_model_id:
                        draft.default_model_id === model.id
                          ? undefined
                          : draft.default_model_id,
                    })
                  }
                />
              ))}
              <div className="flex gap-2">
                <Input
                  value={newModelId}
                  onChange={(e) => setNewModelId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addModel();
                    }
                  }}
                  placeholder="model id, e.g. llama3.1:8b"
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  variant="outline"
                  disabled={newModelId.trim().length === 0}
                  onClick={addModel}
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={state.kind === "saving"}
                onClick={() => void handleRemove()}
              >
                Remove
              </Button>
              <Button
                size="default"
                disabled={saveDisabled}
                onClick={() => void handleSave()}
              >
                {state.kind === "saving" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Save
              </Button>
            </div>
          </>
        )}

        {state.kind === "error" && (
          <button
            type="button"
            role="alert"
            aria-live="polite"
            onClick={() => void refresh()}
            className="self-start text-left text-sm text-destructive underline-offset-4 hover:underline"
          >
            {state.message} (click to retry)
          </button>
        )}

        {draft && providers.canRevealConfigFile() && (
          <p className="text-xs text-muted-foreground">
            Stored as plain JSON — detected values refresh automatically; to pin
            a value the endpoint reports wrong, set <code>overrides</code> in{" "}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => void providers.revealConfigFile()}
            >
              endpoints.json
            </button>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const compactTokens = new Intl.NumberFormat("en-US", { notation: "compact" });

/**
 * One registered model. Detection owns the capability fields: a value
 * the endpoint reported renders as a read-only badge (no input over
 * discoverable truth — a hand-typed snapshot only rots). Inputs appear
 * ONLY where detection has nothing (manual adds, ids-only gateways);
 * they write to `overrides`, the sticky human slot a probe refresh
 * never touches.
 */
function LocalModelRow({
  model,
  onChange,
  onRemove,
}: {
  model: EndpointModelEntry;
  onChange: (next: EndpointModelEntry) => void;
  onRemove: () => void;
}) {
  const resolved = resolveEndpointModel(model);
  const ctxOverridden = model.overrides?.contextWindow !== undefined;
  const toolsOverridden = model.overrides?.tool_call !== undefined;

  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2">
      <span className="flex-1 truncate font-mono text-xs">{model.id}</span>

      {model.contextWindow !== undefined ? (
        <span
          className="shrink-0 rounded-md bg-secondary px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground"
          title={
            ctxOverridden
              ? "Context window (manual override from endpoints.json)"
              : "Context window (detected from the endpoint)"
          }
        >
          {/* non-null: this branch is gated on a detected contextWindow,
              and resolution only ever overrides it, never unsets it */}
          {compactTokens.format(resolved.contextWindow!)} ctx
          {ctxOverridden ? " ·m" : ""}
        </span>
      ) : (
        <Input
          className="h-8 w-28 text-xs"
          type="number"
          min={1024}
          step={1024}
          value={model.overrides?.contextWindow ?? ""}
          onChange={(e) => {
            const value = e.target.valueAsNumber;
            onChange({
              ...model,
              overrides: {
                ...model.overrides,
                contextWindow: Number.isFinite(value)
                  ? Math.max(1, Math.floor(value))
                  : undefined,
              },
            });
          }}
          placeholder="ctx (8192)"
          aria-label="Context window (tokens)"
        />
      )}

      {model.tool_call !== undefined ? (
        <span
          className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground"
          title={
            toolsOverridden
              ? "Tool-calling (manual override from endpoints.json)"
              : "Tool-calling (detected from the endpoint)"
          }
        >
          {resolved.tool_call ? "tools" : "no tools"}
        </span>
      ) : (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch
            checked={resolved.tool_call ?? true}
            onCheckedChange={(checked) =>
              onChange({
                ...model,
                overrides: { ...model.overrides, tool_call: checked },
              })
            }
            aria-label="Supports tool calls"
          />
          tools
        </label>
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Remove ${model.id}`}
        onClick={onRemove}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

/* ────────────────────────────── About ────────────────────────────── */

function AboutSection() {
  // `app.getAppInfo` is sync and depends only on `bridge.app.*`, which the
  // preload sets at construction time — safe to read at render.
  const [info] = useState<{
    version: string;
    platform: string;
  } | null>(() => {
    try {
      return app.getAppInfo();
    } catch {
      return null;
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>About</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Version</dt>
          <dd>{info ? info.version : <Skeleton className="h-4 w-16" />}</dd>
          <dt className="text-muted-foreground">Platform</dt>
          <dd>
            {info ? (
              app.describePlatform(info.platform)
            ) : (
              <Skeleton className="h-4 w-20" />
            )}
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}

/* ──────────────────────────── helpers ──────────────────────────── */

function describeError(err: unknown): string {
  if (err instanceof DesktopBridgeMissingError) {
    return "Desktop bridge unavailable. Please relaunch Grida Desktop.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Please try again.";
}
