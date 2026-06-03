"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BYOK_PROVIDER_LABELS,
  DesktopBridgeMissingError,
  app,
  secrets,
  type ByokProviderId,
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
            AI provider keys and app info.
          </p>
        </header>

        <ByokSection />
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

function ByokRow({ providerId: providerId }: { providerId: ByokProviderId }) {
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
