"use client";
// GRIDA-GG: desktop — GG sign-out + BYOK precedence copy (docs/wg/platform/hosted-ai.md)

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  Loader2,
  Trash2,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Label } from "@app/ui/components/label";
import { Switch } from "@app/ui/components/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@app/ui/components/collapsible";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@app/ui/components/card";
import { Skeleton } from "@app/ui/components/skeleton";
import { models } from "@grida/ai-models";
import {
  BlackForestLabsLogo,
  ClaudeLogo,
  FalLogo,
  GoogleLogo,
  OllamaLogo,
  OpenAILogo,
  OpenRouterLogo,
  RecraftLogo,
  VercelLogo,
  XAILogo,
} from "@grida/react-icons/logos";
import {
  DesktopBridgeMissingError,
  OLLAMA_ENDPOINT_PRESET,
  app,
  images,
  video,
  mergeProbedModels,
  providers,
  resolveEndpointModel,
  secrets,
  type ByokProviderId,
  type ByokProviderMetadata,
  type EndpointModelEntry,
  type EndpointProviderConfig,
} from "@/lib/desktop/bridge";
import Link from "next/link";
import {
  DesktopPageContent,
  DesktopPageShell,
} from "@/scaffolds/desktop/chrome/page-shell";
import * as gridaGateway from "@/lib/desktop/gg-session";
import { CreditsSection } from "./_components/credits-section";

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
            Account, credits, providers, external agents, and app info.
          </p>
        </header>

        <AccountSection />
        <CreditsSection />
        <SettingsSection
          title="LLM Providers"
          description="Text model providers for Grida's native agent."
        >
          <ByokSection
            title="Providers"
            description={
              <>
                Connect provider API keys or local model endpoints.
                Grida-included AI works when you&apos;re signed in; keys you add
                here take precedence.
              </>
            }
            modalities={["text"]}
          >
            <OllamaProviderRow />
          </ByokSection>
        </SettingsSection>
        <SettingsSection
          title="Image/Video/Audio Providers"
          description="Generation providers for media workflows."
        >
          <ByokSection
            title="Media Provider Keys"
            description="Provider keys for image, video, and audio workflows. Providers that also serve LLMs may appear in both sections."
            modalities={["image", "video"]}
          />
          <MediaModelsSection />
        </SettingsSection>
        <AcpSection />
        <AboutSection />
      </DesktopPageContent>
    </DesktopPageShell>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/* ───────────────────────────── Account ───────────────────────────── */

type AccountState =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "signed-in"; email: string | null }
  | { kind: "signing-out" };

/**
 * The Grida account this app is signed in with. Session reads and sign-out
 * go through the same-origin `/desktop/auth/*` routes — the desktop CSP
 * blocks direct supabase-js calls, and navigating to the web `/sign-out`
 * would be handed to the OS browser by the navigation guard (see
 * GRIDA-SEC-005 in /SECURITY.md).
 *
 * The cookie jar is shared across all desktop windows, so signing out here
 * signs out the whole app; other open windows keep their rendered state
 * until their next navigation hits the welcome gate.
 */
function AccountSection() {
  const [state, setState] = useState<AccountState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/desktop/auth/me")
      .then((res) => res.json())
      .then(({ user }: { user: { email: string | null } | null }) => {
        if (cancelled) return;
        setState(
          user
            ? { kind: "signed-in", email: user.email }
            : { kind: "signed-out" }
        );
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "signed-out" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    setState({ kind: "signing-out" });
    try {
      // GRIDA-SEC-006 — drop the sidecar's hosted-AI session first
      // (best-effort; the token's 15-min expiry is the backstop).
      await gridaGateway.clear();
      await fetch("/desktop/auth/sign-out", { method: "POST" });
    } finally {
      window.location.assign("/desktop/auth/sign-in");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>
          The Grida account this app is signed in with.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.kind === "loading" ? (
          <Skeleton className="h-9 w-full" />
        ) : state.kind === "signed-out" ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-muted-foreground">Not signed in</span>
            <Button
              size="sm"
              onClick={() => window.location.assign("/desktop/auth/sign-in")}
            >
              Sign in
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">
              {state.kind === "signed-in" && state.email
                ? state.email
                : "Signed in"}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={signOut}
              disabled={state.kind === "signing-out"}
            >
              Sign out
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────── Providers ──────────────────────────── */

type ProviderModality = "text" | "image" | "video";

const BYOK_PROVIDER_LOGOS: Partial<
  Record<ByokProviderId, React.ComponentType<React.ComponentProps<"svg">>>
> = {
  openrouter: OpenRouterLogo,
  vercel: VercelLogo,
  fal: FalLogo,
};

const MODEL_VENDOR_LOGOS: Partial<
  Record<models.Vendor, React.ComponentType<React.ComponentProps<"svg">>>
> = {
  openai: OpenAILogo,
  "recraft-ai": RecraftLogo,
  google: GoogleLogo,
  "black-forest-labs": BlackForestLabsLogo,
  xai: XAILogo,
};

const BYOK_PROVIDER_SETUP: Record<
  ByokProviderId,
  {
    label: string;
    article: "an" | "a";
    consoleLabel: string;
    consoleHref: string;
    placeholder: string;
  }
> = {
  openrouter: {
    label: "OpenRouter",
    article: "an",
    consoleLabel: "OpenRouter keys",
    consoleHref: "https://openrouter.ai/settings/keys",
    placeholder: "sk-or-v1-00000000000000000000000000000000",
  },
  vercel: {
    label: "Vercel AI Gateway",
    article: "a",
    consoleLabel: "Vercel AI Gateway's console",
    consoleHref: "https://vercel.com/ai-gateway",
    placeholder: "vck_00000000000000000000000000000000",
  },
  fal: {
    label: "fal",
    article: "a",
    consoleLabel: "fal dashboard keys",
    consoleHref: "https://fal.ai/dashboard/keys",
    placeholder: "fal_sk_00000000000000000000000000000000",
  },
};

function providerServesAny(
  provider: ByokProviderMetadata,
  modalities: readonly ProviderModality[]
): boolean {
  return modalities.some((modality) =>
    (provider.modalities as readonly string[]).includes(modality)
  );
}

function ByokSection({
  title,
  description,
  modalities,
  excludeModalities = [],
  children,
}: {
  title: string;
  description: ReactNode;
  modalities: readonly ProviderModality[];
  excludeModalities?: readonly ProviderModality[];
  children?: ReactNode;
}) {
  const byokProviders = secrets
    .byokProviderMetadata()
    .filter(
      (provider) =>
        providerServesAny(provider, modalities) &&
        !providerServesAny(provider, excludeModalities)
    );
  const precedence = byokProviders
    .map((provider) => provider.label)
    .join(" → ");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description}
          {precedence ? <> Precedence: {precedence}.</> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {byokProviders.map((provider) => (
            <ByokRow key={provider.id} provider={provider} />
          ))}
          {children}
        </div>
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

function ByokRow({ provider }: { provider: ByokProviderMetadata }) {
  const providerId = provider.id;
  const setup = BYOK_PROVIDER_SETUP[providerId];
  const label = setup.label;
  const [open, setOpen] = useState(false);
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

  // Row status — driven by the stable facet of state. Saving/removing keep the
  // visible state steady so the row has a continuous visual anchor in flight.
  const statusKind = stableKind(state);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex min-w-0 items-center gap-3">
            <ProviderLogo providerId={providerId} label={label} />
            <span className="truncate text-base font-medium">{label}</span>
            {statusKind === "configured" && (
              <CheckIcon className="size-4 shrink-0 text-emerald-600" />
            )}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {statusKind === "loading" && <Skeleton className="h-4 w-16" />}
            <ChevronDownIcon
              className={`size-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-6 pb-5 text-sm text-muted-foreground">
          <p className="text-foreground">
            {statusKind === "configured"
              ? `${label} is connected.`
              : `To use Grida with ${label}, add ${setup.article} API key.`}
          </p>
          {statusKind !== "configured" && (
            <>
              <p className="mt-2">Follow these steps:</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex gap-2">
                  <span aria-hidden="true">-</span>
                  <span>
                    Create an API key in{" "}
                    <a
                      href={setup.consoleHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
                    >
                      {setup.consoleLabel}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </span>
                </li>
                <li className="flex gap-2">
                  <span aria-hidden="true">-</span>
                  <span>Paste your API key below and press Enter.</span>
                </li>
              </ul>
            </>
          )}

          <div className="mt-3">
            {state.kind === "loading" ? (
              <Skeleton className="h-9 w-full" />
            ) : statusKind === "configured" ? (
              <Button
                variant="outline"
                size="sm"
                disabled={state.kind === "removing"}
                onClick={() => void handleRemove()}
              >
                {state.kind === "removing" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Remove key
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={setup.placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    void handleSave();
                  }}
                  disabled={state.kind === "saving"}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button
                  size="default"
                  disabled={
                    state.kind === "saving" || value.trim().length === 0
                  }
                  onClick={() => void handleSave()}
                >
                  {state.kind === "saving" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Save
                </Button>
              </div>
            )}
          </div>

          {state.kind === "error" && (
            <button
              type="button"
              role="alert"
              aria-live="polite"
              onClick={handleErrorDismiss}
              className="mt-2 text-left text-sm text-destructive underline-offset-4 hover:underline"
            >
              {state.message} (click to retry)
            </button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ProviderLogo({
  providerId,
  label,
}: {
  providerId: ByokProviderId;
  label: string;
}) {
  const Logo = BYOK_PROVIDER_LOGOS[providerId];
  if (!Logo) {
    return (
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded border bg-muted text-[10px] font-medium text-muted-foreground"
      >
        {label.slice(0, 1)}
      </span>
    );
  }

  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded border bg-background">
      <Logo
        aria-hidden="true"
        focusable="false"
        className="size-4 text-foreground"
      />
    </span>
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

/* ────────────────────────────── ACP ──────────────────────────────── */

type AcpDetectState = "checking" | "installed" | "missing";

function AcpSection() {
  const [claude, setClaude] = useState<AcpDetectState>("checking");

  const detect = useCallback(async () => {
    setClaude("checking");
    try {
      const { installed } = await providers.detectClaude();
      setClaude(installed ? "installed" : "missing");
    } catch {
      setClaude("installed");
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  return (
    <SettingsSection
      title="ACP (Experimental)"
      description="External agents connected through the Agent Client Protocol."
    >
      <Card>
        <CardHeader>
          <CardTitle>Claude Code</CardTitle>
          <CardDescription>
            Runs as an external agent on the user&apos;s Claude subscription.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded border bg-background">
                <ClaudeLogo
                  aria-hidden="true"
                  focusable="false"
                  className="size-5 text-foreground"
                />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">Claude Code</span>
                <span className="text-xs text-muted-foreground">
                  Local CLI bridge via ACP.
                </span>
              </div>
            </div>
            {claude === "checking" ? (
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Checking
              </span>
            ) : claude === "installed" ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                Detected
              </span>
            ) : (
              <span className="shrink-0 text-xs text-muted-foreground">
                Not found
              </span>
            )}
          </div>

          {claude === "missing" && (
            <div className="flex flex-col gap-2 border-t pt-3 text-xs text-muted-foreground">
              <code className="rounded bg-muted px-2 py-1 font-mono text-foreground">
                npm install -g @anthropic-ai/claude-code
              </code>
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => void detect()}
              >
                I&apos;ve installed it
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </SettingsSection>
  );
}

/* ───────────────────────────── Models ───────────────────────────── */

/** Media providers, by precedence — one connected key unlocks media routes. */
const MEDIA_PROVIDER_IDS = [
  "openrouter",
  "vercel",
  "fal",
] as const satisfies readonly ByokProviderId[];

/**
 * Media-generation models (#908). Shows the curated, provider-agnostic image
 * and video lists with provider availability badges. The agent host resolves
 * the provider per request; the renderer never sees the key (GRIDA-SEC-004).
 */
function MediaModelsSection() {
  const [ready, setReady] = useState<boolean | null>(null);
  const imageSupported = images.isSupported();
  const videoSupported = video.isSupported();
  const imageModels = imageSupported ? models.image.listed_models() : [];
  const videoModels = videoSupported ? models.video.listed_models() : [];

  useEffect(() => {
    if (!imageSupported && !videoSupported) return;
    let live = true;
    (async () => {
      const present = await Promise.all(
        MEDIA_PROVIDER_IDS.map((id) => secrets.hasKey(id).catch(() => false))
      );
      if (live) setReady(present.some(Boolean));
    })();
    return () => {
      live = false;
    };
  }, [imageSupported, videoSupported]);

  if (!imageSupported && !videoSupported) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media models</CardTitle>
        <CardDescription>
          {ready === null
            ? "Checking your connected providers…"
            : ready
              ? "Ready — you can generate media with the models below."
              : "Connect an OpenRouter, Vercel, or fal key above to use these."}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {imageSupported && (
          <MediaModelGroup
            title="Image"
            models={imageModels}
            ready={ready === true}
            hrefForModel={(id) =>
              `/desktop/images?model=${encodeURIComponent(id)}`
            }
            actionLabel="Open in image generator"
          />
        )}
        {videoSupported && (
          <MediaModelGroup
            title="Video"
            models={videoModels}
            ready={ready === true}
            hrefForModel={(id) =>
              `/desktop/video?model=${encodeURIComponent(id)}`
            }
            actionLabel="Open in video generator"
          />
        )}
      </CardContent>
    </Card>
  );
}

type MediaModelCard = {
  id: string;
  label: string;
  short_description: string;
  vendor: models.Vendor;
  providers: object;
};

function MediaModelGroup({
  title,
  models,
  ready,
  hrefForModel,
  actionLabel,
}: {
  title: string;
  models: readonly MediaModelCard[];
  ready: boolean;
  hrefForModel: (id: string) => string;
  actionLabel: string;
}) {
  return (
    <section className="border-t first:border-t-0">
      <header className="px-6 py-3">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      </header>
      <div className="divide-y">
        {models.map((card) => (
          <MediaModelRow
            key={card.id}
            card={card}
            ready={ready}
            href={hrefForModel(card.id)}
            actionLabel={actionLabel}
          />
        ))}
      </div>
    </section>
  );
}

function MediaModelRow({
  card,
  ready,
  href,
  actionLabel,
}: {
  card: MediaModelCard;
  ready: boolean;
  href: string;
  actionLabel: string;
}) {
  return (
    <div className="flex gap-3 px-6 py-4 text-sm">
      <MediaVendorLogo vendor={card.vendor} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium">{card.label}</span>
          <MediaProviderLogos providers={card.providers} />
        </div>
        <span className="text-xs text-muted-foreground">
          {card.short_description}
        </span>
        {ready && (
          <Button
            asChild
            variant="link"
            size="sm"
            className="mt-1 h-auto self-start p-0 text-xs"
          >
            <Link href={href}>{actionLabel}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function MediaVendorLogo({ vendor }: { vendor: models.Vendor }) {
  const Logo = MODEL_VENDOR_LOGOS[vendor];
  if (!Logo) {
    return (
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded border bg-muted text-[10px] font-medium uppercase text-muted-foreground"
      >
        {vendor.slice(0, 1)}
      </span>
    );
  }

  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded border bg-background"
      aria-hidden="true"
    >
      <Logo focusable="false" className="size-5 text-foreground" />
    </span>
  );
}

function MediaProviderLogos({ providers }: { providers: object }) {
  const providerIds = MEDIA_PROVIDER_IDS.filter((id) =>
    Object.prototype.hasOwnProperty.call(providers, id)
  );

  return (
    <div className="flex shrink-0 -space-x-1" aria-hidden="true">
      {providerIds.map((id) => {
        const Logo = BYOK_PROVIDER_LOGOS[id];
        if (!Logo) return null;
        return (
          <span
            key={id}
            className="flex size-5 items-center justify-center rounded border bg-background ring-1 ring-background"
          >
            <Logo focusable="false" className="size-3.5 text-foreground" />
          </span>
        );
      })}
    </div>
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

function OllamaProviderRow() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LocalState>({ kind: "loading" });
  const [newModelId, setNewModelId] = useState("");
  const [probing, setProbing] = useState(false);
  const [probeNote, setProbeNote] = useState<string | null>(null);
  // Whether the endpoint config exists on the host — the API-key slot is
  // only rendered then (the secrets allowlist accepts CONFIGURED endpoint
  // ids; a key for an unsaved draft would 400).
  const [persisted, setPersisted] = useState(false);
  // Stale-write guard: detection runs async off a SNAPSHOT of the config
  // while the form stays editable. Any user action that changes what the
  // draft means (edit, save, remove, re-setup) bumps this; a completion
  // holding an older number drops its write instead of resurrecting a
  // deleted endpoint or wiping newer unsaved edits.
  const opVersion = useRef(0);

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
      const version = opVersion.current;
      setProbing(true);
      setProbeNote(null);
      try {
        const result = await providers.probeEndpoint(base.base_url);
        // `base` is stale once the user edited/saved/removed mid-probe —
        // applying it would undo their action. Drop the result silently.
        if (opVersion.current !== version) return;
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
          if (opVersion.current !== version) return;
          setState({ kind: "ready", draft: next, dirty: false });
        } else {
          setState({ kind: "ready", draft: next, dirty: true });
        }
      } catch (err) {
        if (opVersion.current !== version) return;
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
    const version = ++opVersion.current;
    try {
      const list = await providers.listEndpoints();
      const ollama = list.find((e) => e.id === OLLAMA_ENDPOINT_PRESET.id);
      if (opVersion.current !== version) return;
      setState({ kind: "ready", draft: ollama ?? null, dirty: false });
      setPersisted(ollama != null);
      // Detected values converge to the server's truth on every visit —
      // notably /api/ps starts reporting a model's REAL allocation once
      // it has been loaded. Fire-and-forget; failures only leave a note.
      if (ollama) void detectInto(ollama, { persist: true });
    } catch (err) {
      if (opVersion.current !== version) return;
      setState({ kind: "error", message: describeError(err), draft: null });
    }
  }, [detectInto]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const draft = "draft" in state ? state.draft : null;

  const edit = useCallback((next: EndpointProviderConfig) => {
    opVersion.current += 1;
    setState({ kind: "ready", draft: next, dirty: true });
  }, []);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    const version = ++opVersion.current;
    setState({ kind: "saving", draft });
    try {
      await providers.setEndpoint(draft);
      const list = await providers.listEndpoints();
      const saved = list.find((e) => e.id === OLLAMA_ENDPOINT_PRESET.id);
      setPersisted(saved != null);
      // An edit made while the save was in flight wins over the read-back.
      if (opVersion.current !== version) return;
      setState({ kind: "ready", draft: saved ?? null, dirty: false });
    } catch (err) {
      if (opVersion.current !== version) return;
      setState({ kind: "error", message: describeError(err), draft });
    }
  }, [draft]);

  const handleEnable = useCallback(() => {
    opVersion.current += 1;
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
    // Bump FIRST: an in-flight detection completing after this click must
    // not persist its snapshot back and resurrect the deleted endpoint.
    opVersion.current += 1;
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

  const connected = persisted && draft != null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded border bg-background">
              <OllamaLogo
                aria-hidden="true"
                focusable="false"
                className="size-4 text-foreground"
              />
            </span>
            <span className="truncate text-base font-medium">Ollama</span>
            {connected && (
              <CheckIcon className="size-4 shrink-0 text-emerald-600" />
            )}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {state.kind === "loading" && <Skeleton className="h-4 w-16" />}
            <ChevronDownIcon
              className={`size-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-4 px-6 pb-5 text-sm text-muted-foreground">
          <p className="text-foreground">
            Run LLMs locally on your machine with{" "}
            <a
              className="underline underline-offset-4"
              href="https://ollama.com"
              target="_blank"
              rel="noreferrer"
            >
              Ollama
            </a>
            , or connect to an Ollama server. Local models vary widely in agent
            ability; larger models (~30B+) are recommended for agent tasks.
          </p>
          <div>
            <p>To use local Ollama:</p>
            <ul className="mt-2 space-y-1.5">
              <li className="flex gap-2">
                <span aria-hidden="true">-</span>
                <span>
                  Download and install Ollama from{" "}
                  <a
                    className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"
                    href="https://ollama.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ollama.com
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true">-</span>
                <span>
                  Start Ollama and pull a model with{" "}
                  <code>ollama run gpt-oss:20b</code>
                </span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden="true">-</span>
                <span>Set up the endpoint below to start using Ollama.</span>
              </li>
            </ul>
          </div>
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
                    {probing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
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
                    add one by id (e.g. <code>llama3.1:8b</code>). The first
                    model is the default.
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

              {persisted && (
                <EndpointKeyRow
                  endpointId={draft.id}
                  label={draft.label ?? draft.id}
                />
              )}

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
              Stored as plain JSON — detected values refresh automatically; to
              pin a value the endpoint reports wrong, set <code>overrides</code>{" "}
              in{" "}
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type EndpointKeyState =
  | { kind: "loading" | "empty" | "configured" | "saving" | "removing" }
  | { kind: "error"; message: string };

/**
 * Optional API key for a configured endpoint (issue #806). Ollama needs
 * none; a keyed self-hosted gateway stores its key HERE — through the
 * same write/presence/delete-only `secrets` surface as BYOK keys, under
 * the ENDPOINT's id (GRIDA-SEC-004: never inside the endpoint config,
 * never readable back). Rendered only for a persisted endpoint, since
 * the secrets allowlist accepts configured endpoint ids only.
 */
function EndpointKeyRow({
  endpointId,
  label,
}: {
  endpointId: string;
  label: string;
}) {
  const [state, setState] = useState<EndpointKeyState>({ kind: "loading" });
  const [value, setValue] = useState("");

  const refresh = useCallback(async () => {
    try {
      setState({
        kind: (await secrets.hasKey(endpointId)) ? "configured" : "empty",
      });
    } catch (err) {
      setState({ kind: "error", message: describeError(err) });
    }
  }, [endpointId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSaveKey = useCallback(async () => {
    setState({ kind: "saving" });
    try {
      await secrets.setKey(endpointId, value);
      setValue("");
      await refresh();
    } catch (err) {
      setValue("");
      setState({ kind: "error", message: describeError(err) });
    }
  }, [endpointId, value, refresh]);

  const handleRemoveKey = useCallback(async () => {
    let confirmed = false;
    try {
      confirmed = await secrets.confirmDeleteKey(endpointId, label);
    } catch (err) {
      setState({ kind: "error", message: describeError(err) });
      return;
    }
    if (!confirmed) return;
    setState({ kind: "removing" });
    try {
      await secrets.deleteKey(endpointId);
      await refresh();
    } catch (err) {
      setState({ kind: "error", message: describeError(err) });
    }
  }, [endpointId, label, refresh]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">API key</Label>
        {(state.kind === "configured" || state.kind === "removing") && (
          <Button
            variant="outline"
            size="sm"
            disabled={state.kind === "removing"}
            onClick={() => void handleRemoveKey()}
          >
            {state.kind === "removing" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            Remove key
          </Button>
        )}
      </div>

      {state.kind === "loading" ? (
        <Skeleton className="h-9 w-full" />
      ) : state.kind === "error" ? (
        <button
          type="button"
          role="alert"
          aria-live="polite"
          onClick={() => void refresh()}
          className="self-start text-left text-sm text-destructive underline-offset-4 hover:underline"
        >
          {state.message} (click to retry)
        </button>
      ) : state.kind === "configured" || state.kind === "removing" ? (
        <p className="text-xs text-muted-foreground">
          A key is configured for this endpoint — stored by the agent host,
          never shown back.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Optional — Ollama needs none"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={state.kind === "saving"}
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="default"
              disabled={state.kind === "saving" || value.trim().length === 0}
              onClick={() => void handleSaveKey()}
            >
              {state.kind === "saving" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Save key
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            For gateways that require authentication (a keyed LiteLLM or vLLM).
            Sent as a bearer token on requests to this endpoint.
          </p>
        </>
      )}
    </div>
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
