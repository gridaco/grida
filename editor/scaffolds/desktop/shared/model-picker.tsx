// GRIDA-GG: desktop — the GG-included picker affordance (docs/wg/platform/hosted-ai.md)
/**
 * Welcome composer model picker — every catalog model grouped by provider,
 * plus any user-registered endpoint models (issue #806 — local Ollama,
 * self-hosted gateways).
 *
 * The chosen provider/model pair rides the welcome handoff, preserving
 * ChatGPT, BYOK, Grida, and endpoint identity separately from the model id.
 * Native chat chooses its model through its own connection picker.
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
import { CheckIcon, ChevronDownIcon } from "lucide-react";
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
import type { EndpointProviderConfig } from "@/lib/desktop/bridge";
import { useConfiguredTextByokProviderIds } from "./registered-models";
import { CHATGPT_PROVIDER_ID, GG_PROVIDER_ID } from "@grida/agent";
import { useGGModels } from "@/lib/desktop/gg-models";
import * as gridaGateway from "@/lib/desktop/gg-session";
import { useChatGptSubscription } from "@/lib/desktop/chatgpt-subscription-react";
import {
  GG_INCLUDED_MODEL_ID,
  reconcileChatGptSubscriptionDefault,
  resolveDefaultModelSelection,
  shouldUpgradeToIncluded,
} from "./default-model";
import {
  model_picker_options,
  type ModelPickerGroup,
  type ModelPickerOption,
  type ModelPickerSelection,
} from "./model-picker-options";

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
  const ggModels = useGGModels();
  const groups = useMemo(
    () =>
      model_picker_options.groups({
        chatGptReady,
        ggModels,
        configuredByokProviderIds,
        endpoints,
      }),
    [chatGptReady, ggModels, configuredByokProviderIds, endpoints]
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
  const modelLabel =
    (value.provider_id === GG_PROVIDER_ID
      ? ggModels?.find((model) => model.id === value.model_id)?.label
      : undefined) ?? model_picker_options.label(value, endpoints);
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
        {option.deprecated && (
          <span className="shrink-0 text-muted-foreground">Legacy</span>
        )}
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
 * Model selection state for the welcome composer. Starts on the
 * provider-owned default (the generic catalog default, ChatGPT when the
 * subscription is ready, or the included Grida tier when a Grida Gateway
 * session is live; issue #942) and keeps that default current until the user
 * picks a model.
 */
export function useModelPickerState(): {
  model_id: string;
  provider_id?: string;
  setSelection: (selection: ModelPickerSelection) => void;
  /** True once the user has explicitly picked a model in the UI (not a
   *  default). A producer of a cross-navigation handoff (the welcome
   *  composer) uses this to carry the model ONLY when it was a deliberate
   *  choice — otherwise the destination resolves its own default, so an
   *  unresolved default never masquerades as a pick. */
  is_user_pick: boolean;
} {
  const chatGptState = useChatGptSubscription();
  const chatGptReady =
    chatGptState.kind === "ready" && chatGptState.status.ready;

  const [selection, setSelection] = useState<ModelPickerSelection>(() =>
    resolveDefaultModelSelection({
      chatGptReady,
      // Synchronous cached GG state: when the session is already known
      // active (warmed by an earlier `ensureFresh`), a keyless surface
      // starts on the included model with no async gap — so an instant
      // first submit can't capture a stale fallback before the
      // effect below runs. `peek()` never does IO; the effect still
      // covers a cold cache.
      ggActive: gridaGateway.peek().kind === "active",
    })
  );
  // Flipped once the user picks a model in the UI, so the async Grida
  // Gateway upgrade below never clobbers a deliberate choice.
  const userPickedRef = useRef(false);
  const [userPicked, setUserPicked] = useState(false);

  // GRIDA-SEC-008 — reconcile async subscription readiness for an untouched
  // selection. Ready promotes the generic fallback to `{ chatgpt, Sol }`;
  // signing out restores the generic fallback so a stale explicit provider
  // cannot make the first send fail. Component state only: no model
  // preference is persisted.
  useEffect(() => {
    setSelection((current) =>
      reconcileChatGptSubscriptionDefault({
        current,
        chatGptReady,
        ggActive: gridaGateway.peek().kind === "active",
        userPicked: userPickedRef.current,
      })
    );
  }, [chatGptReady]);

  // GRIDA-SEC-006 / issue #942 — when a Grida Gateway session is live and
  // the user hasn't otherwise chosen a model, keep the keyless default on the
  // included hosted tier. Session liveness resolves async, so this arrives
  // after mount; `shouldUpgradeToIncluded` guards on the live ref so an
  // explicit pick always wins the race. The catalog itself is never hidden —
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
