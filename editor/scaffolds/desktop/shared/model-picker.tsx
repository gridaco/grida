// GRIDA-GG: desktop — the GG-included picker affordance (docs/wg/platform/hosted-ai.md)
/**
 * Desktop model picker — every catalog model grouped by provider, plus
 * any user-registered endpoint models (issue #806 — local Ollama,
 * self-hosted gateways).
 *
 * The agent system is tier-based (4 tiers → 4 models), but the catalog
 * holds more models than the tiers map to, leaving some unreachable.
 * This picker lists them all so a desktop user can run any specific
 * model. The chosen provider/model pair rides end-to-end (renderer → agent
 * sidecar → model factory), preserving native ChatGPT, BYOK, Grida, and
 * endpoint identity separately from the model id.
 */

"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckIcon, ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@app/ui/components/command";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { cn } from "@app/ui/lib/utils";
import {
  GridaLogo,
  OllamaLogo,
  OpenAILogo,
  OpenRouterLogo,
  VercelLogo,
} from "@grida/react-icons/logos";
// Pull the catalog from the framework-free `@grida/ai-models` package,
// NOT the editor's `@/lib/ai/models` seam — that seam constructs server
// providers (live keys) and is lint-blocked from the desktop renderer
// (GRIDA-SEC-004). This package is pure data and renderer-safe.
import _models from "@grida/ai-models";
import type {
  ChatSessionRow,
  EndpointProviderConfig,
} from "@/lib/desktop/bridge";
import {
  registered_models,
  useConfiguredTextByokProviderIds,
} from "./registered-models";
import {
  CHATGPT_PROVIDER_ID,
  GG_PROVIDER_ID,
  isChatGptSubscriptionModelId,
} from "@grida/agent";
import * as gridaGateway from "@/lib/desktop/gg-session";
import { useChatGptSubscription } from "@/lib/desktop/chatgpt-subscription-react";
import {
  GG_INCLUDED_MODEL_ID,
  reconcileChatGptSubscriptionDefault,
  resolveDefaultModelSelection,
  resolveNewChatTransition,
  shouldUpgradeToIncluded,
} from "./default-model";
import {
  model_picker_options,
  type ModelPickerGroup,
  type ModelPickerOption,
  type ModelPickerSelection,
} from "./model-picker-options";
// The default-model constants live in a react-free module so the decision
// is unit-testable in Node; re-exported here to keep the public symbol home.
export { DEFAULT_MODEL_ID } from "./default-model";

const catalog = _models.text.catalog;
type CatalogId = _models.text.CatalogId;

function isCatalogId(id: string | undefined | null): id is CatalogId {
  return typeof id === "string" && Object.hasOwn(catalog, id);
}

export function DesktopModelPicker({
  value,
  onValueChange,
  endpoints = [],
}: {
  value: ModelPickerSelection;
  onValueChange: (selection: ModelPickerSelection) => void;
  /** Configured endpoint providers whose registered models join the list
   *  (grouped under the endpoint's label). */
  endpoints?: readonly EndpointProviderConfig[];
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  // GRIDA-SEC-008 — this hook exposes only the secret-free status DTO. OAuth
  // credentials remain in Electron main + the sidecar.
  const chatGptState = useChatGptSubscription();
  const chatGptStatus =
    chatGptState.kind === "ready" ? chatGptState.status : null;
  const chatGptReady = chatGptStatus?.ready === true;
  const configuredByokProviderIds = useConfiguredTextByokProviderIds();
  const groups = useMemo(
    () =>
      model_picker_options.groups({
        chatGptReady,
        configuredByokProviderIds,
        endpoints,
      }),
    [chatGptReady, configuredByokProviderIds, endpoints]
  );
  const selectedCommandValue = useMemo(() => {
    for (const group of groups) {
      const option = group.options.find((candidate) =>
        model_picker_options.selected(value, candidate.selection)
      );
      if (option) return modelPickerCommandValue(group, option);
    }
    return undefined;
  }, [groups, value]);
  const modelLabel = model_picker_options.label(value, endpoints);
  const usesChatGpt = model_picker_options.usesChatGpt(value);
  const providerLabel = usesChatGpt
    ? "ChatGPT Subscription"
    : (model_picker_options.providerLabel(value.provider_id, endpoints) ??
      "Automatic");

  const choose = useCallback(
    (selection: ModelPickerSelection) => {
      onValueChange(selection);
      setOpen(false);
    },
    [onValueChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="min-w-0 max-w-48 gap-1.5 px-2 text-xs font-normal"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-label={`Model: ${modelLabel}, provider: ${providerLabel}`}
        >
          <ProviderLogo
            providerId={value.provider_id}
            className="size-3.5 shrink-0 text-foreground"
          />
          <span className="min-w-0 truncate">{modelLabel}</span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        role="presentation"
        align="end"
        sideOffset={6}
        className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <Command defaultValue={selectedCommandValue}>
          <CommandInput placeholder="Search models…" />
          <CommandList
            id={listId}
            className="max-h-[min(52vh,24rem)]"
            aria-label="Text models"
          >
            <CommandEmpty>No models found.</CommandEmpty>

            {groups.map((group, index) => (
              <Fragment key={group.id}>
                {index > 0 && <CommandSeparator />}
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-2">
                      <ProviderLogo
                        providerId={group.id}
                        className="size-3.5 text-foreground"
                      />
                      <span>{group.label}</span>
                    </span>
                  }
                >
                  <ModelPickerGroupItems
                    group={group}
                    current={value}
                    onChoose={choose}
                  />
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProviderLogo({
  providerId,
  className,
}: {
  providerId: string | undefined;
  className?: string;
}) {
  switch (providerId) {
    case CHATGPT_PROVIDER_ID:
      return <OpenAILogo aria-hidden="true" className={className} />;
    case GG_PROVIDER_ID:
      return <GridaLogo aria-hidden="true" className={className} />;
    case "openrouter":
      return <OpenRouterLogo aria-hidden="true" className={className} />;
    case "vercel":
      return <VercelLogo aria-hidden="true" className={className} />;
    case "ollama":
      return <OllamaLogo aria-hidden="true" className={className} />;
    default:
      return null;
  }
}

function ModelPickerGroupItems({
  group,
  current,
  onChoose,
}: {
  group: ModelPickerGroup;
  current: ModelPickerSelection;
  onChoose: (selection: ModelPickerSelection) => void;
}) {
  return group.options.map((option) => {
    const selected = model_picker_options.selected(current, option.selection);
    return (
      <CommandItem
        key={`${option.selection.provider_id ?? "automatic"}:${option.selection.model_id}`}
        value={modelPickerCommandValue(group, option)}
        onSelect={() => onChoose(option.selection)}
        className="text-xs"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left",
            option.deprecated && "text-muted-foreground"
          )}
        >
          {option.label}
        </span>
        <CheckIcon
          aria-hidden="true"
          className={cn("size-3.5", selected ? "opacity-100" : "opacity-0")}
        />
      </CommandItem>
    );
  });
}

function modelPickerCommandValue(
  group: ModelPickerGroup,
  option: ModelPickerOption
): string {
  return `${option.label} ${group.label} ${option.selection.provider_id ?? "automatic"} ${option.selection.model_id}`;
}

/**
 * Inline notice for a selected model that is marked `tool_call: false`
 * (issue #806). The agent loop is tool-heavy (files, commands, todos) —
 * gating is deliberately permissive (the run is not blocked), so the
 * honest move is a visible expectation-setter, not a hard stop.
 */
export function ModelToolCallNotice({
  model_id: modelId,
  provider_id: providerId,
  endpoints,
}: {
  model_id: string;
  provider_id?: string;
  endpoints: readonly EndpointProviderConfig[];
}) {
  // Memoized: this renders inside chat panels that re-render per streamed
  // token, and resolve() rebuilds the flattened spec list each call.
  const spec = useMemo(
    () => registered_models.resolve(modelId, endpoints, providerId),
    [modelId, providerId, endpoints]
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
 * so opening a past chat shows the model it ran with and opening a genuinely
 * new chat resolves a fresh provider-owned default. A background session-list
 * refresh never clobbers a pick the user just made (the seed fires once per
 * id, not per `sessions` change). When a Grida Gateway session is live and
 * nothing else has claimed the selection, the keyless default is upgraded to
 * the included hosted tier ({@link GG_INCLUDED_MODEL_ID}; issue #942).
 */
export function useModelPickerState({
  current_id: currentId,
  binding_epoch: bindingEpoch,
  sessions,
  initial,
  initial_provider_id: initialProviderId,
  endpoints = [],
}: {
  current_id: string | null;
  /** Real chat-binding generation from `useChatSession().epoch`. */
  binding_epoch: number;
  sessions: ChatSessionRow[];
  /** Initial selection, applied only on first mount. Falls back to
   * {@link DEFAULT_MODEL_ID} when absent or not a known model id. */
  initial?: string;
  /** Provider paired with `initial`, when it was an explicit provider/model
   *  selection (for example the welcome handoff's ChatGPT choice). */
  initial_provider_id?: string;
  /** Configured endpoint providers — their registered model ids count as
   *  known, so a session that ran on a local model re-seeds correctly. */
  endpoints?: readonly EndpointProviderConfig[];
}): {
  model_id: string;
  provider_id?: string;
  setSelection: (selection: ModelPickerSelection) => void;
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
  const chatGptState = useChatGptSubscription();
  const chatGptReady =
    chatGptState.kind === "ready" && chatGptState.status.ready;
  const isKnownId = (id: string | undefined | null): id is string =>
    (typeof id === "string" && isChatGptSubscriptionModelId(id)) ||
    isCatalogId(id) ||
    (typeof id === "string" && registeredIds.has(id));

  // Whether a caller passed an `initial` at all — a stable mount-time fact
  // (the prop never changes). The GG upgrade guards on THIS, not on whether
  // `initial` is *known*: knownness depends on the async endpoint registry
  // and would go stale in the mount-only effect below, letting a late-loading
  // endpoint pick get overwritten.
  const initialProvided = initial != null && initial !== "";

  const [selection, setSelection] = useState<ModelPickerSelection>(() =>
    resolveDefaultModelSelection({
      initial,
      initialProviderId,
      chatGptReady: currentId === null && chatGptReady,
      // Synchronous cached GG state: when the session is already known
      // active (warmed by an earlier `ensureFresh`), a keyless surface
      // starts on the included model with no async gap — so an instant
      // first submit can't capture a stale fallback before the
      // effect below runs. `peek()` never does IO; the effect still
      // covers a cold cache.
      ggActive: gridaGateway.peek().kind === "active",
      isKnownId,
    })
  );
  // Flipped once the user picks a model in the UI, so the async Grida
  // Gateway upgrade below never clobbers a deliberate choice.
  const userPickedRef = useRef(false);
  const [userPicked, setUserPicked] = useState(false);
  // The session id we last seeded from. Re-seed only when the active id
  // changes — `undefined` means "never seeded" so the first run fires.
  const seededFor = useRef<string | null | undefined>(undefined);
  // Unlike `seededFor`, this tracks real rebindings even when the id remains
  // null. It distinguishes the initial mount from an explicit New Chat.
  const previousBindingEpoch = useRef<number | undefined>(undefined);
  // A welcome handoff applies only to the first fresh chat on this mount.
  // Once any persisted session has been observed, later New Chat transitions
  // must resolve the current provider default instead of reusing that handoff.
  const initialSeedActive = useRef(initialProvided);

  useEffect(() => {
    const previousEpoch = previousBindingEpoch.current;
    previousBindingEpoch.current = bindingEpoch;

    if (currentId === null) {
      const freshSelection = resolveNewChatTransition({
        previousBindingEpoch: previousEpoch,
        currentBindingEpoch: bindingEpoch,
        currentSessionId: currentId,
        chatGptReady,
        ggActive: gridaGateway.peek().kind === "active",
      });
      seededFor.current = null;
      if (freshSelection) {
        initialSeedActive.current = false;
        userPickedRef.current = false;
        setUserPicked(false);
        setSelection(freshSelection);
      }
      return;
    }
    if (seededFor.current === currentId) return;
    initialSeedActive.current = false;
    const row = sessions.find((s) => s.id === currentId);
    // Row not in the list yet (still loading) — wait for it before
    // committing, so we don't lock in the default and skip the real seed.
    if (!row) return;
    const stored = row.model?.model_id;
    if (isKnownId(stored)) {
      setSelection({
        model_id: stored,
        ...(row.model?.provider_id
          ? { provider_id: row.model.provider_id }
          : {}),
      });
      seededFor.current = currentId;
      return;
    }
    // Stored id not (yet) known. Endpoints load async — when the session
    // ran on a registered local model, leave the seed open so the
    // `registeredIds` dep can complete it once the endpoint list lands.
    // A session with NO stored model is seeded-done immediately.
    if (!stored) seededFor.current = currentId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bindingEpoch, chatGptReady, currentId, sessions, registeredIds]);

  // GRIDA-SEC-008 — reconcile async subscription readiness for a genuinely
  // fresh, untouched chat. Ready promotes the generic fallback to
  // `{ chatgpt, Sol }`; signing out restores the generic fallback so a stale
  // explicit provider cannot make the next send fail. Component state only:
  // no model preference is persisted.
  useEffect(() => {
    if (currentId !== null) return;
    setSelection((current) =>
      reconcileChatGptSubscriptionDefault({
        current,
        chatGptReady,
        ggActive: gridaGateway.peek().kind === "active",
        userPicked: userPickedRef.current,
        hasInitial: initialSeedActive.current,
        storedSeeded: seededFor.current != null,
      })
    );
  }, [chatGptReady, currentId]);

  // GRIDA-SEC-006 / issue #942 — when a Grida Gateway session is live and
  // the user hasn't otherwise chosen a model, keep the keyless default on the
  // included hosted tier. Session liveness resolves async, so this arrives
  // after mount; `shouldUpgradeToIncluded` guards on live refs + the stable
  // `initialProvided` so an explicit pick, a caller `initial`, or a stored-
  // session seed always wins the race. The catalog itself is never hidden —
  // BYOK can still serve any model.
  useEffect(() => {
    if (!gridaGateway.isSupported()) return;
    let cancelled = false;
    void gridaGateway.ensureFresh().then((state) => {
      if (cancelled || state.kind !== "active") return;
      setSelection((current) =>
        shouldUpgradeToIncluded({
          current,
          userPicked: userPickedRef.current,
          hasInitial: initialProvided,
          storedSeeded: seededFor.current != null,
        })
          ? {
              model_id: GG_INCLUDED_MODEL_ID,
              provider_id: GG_PROVIDER_ID,
            }
          : current
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
  // the raw state setters, so it doesn't trip the flag.
  const pickSelection = useCallback((selection: ModelPickerSelection) => {
    userPickedRef.current = true;
    setUserPicked(true);
    setSelection(selection);
  }, []);

  return {
    model_id: selection.model_id,
    provider_id: selection.provider_id,
    setSelection: pickSelection,
    is_user_pick: userPicked,
  };
}
