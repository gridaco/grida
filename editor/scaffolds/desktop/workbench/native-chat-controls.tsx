"use client";

import { useState } from "react";
import type {
  NativeChatEffort,
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  EllipsisVerticalIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import {
  OpenRouterLogo,
  VercelLogo,
  GridaLogo,
  OllamaLogo,
  OpenAILogo,
} from "@grida/react-icons/logos";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { Slider } from "@app/ui/components/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@app/ui/components/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import type {
  NativeChatController,
  NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

export function NativeChatHeader({
  controller,
  state,
  onGoal,
  onSubagents,
}: {
  controller: NativeChatController;
  state: NativeChatView;
  onGoal: () => void;
  onSubagents: () => void;
}) {
  const [open, setOpen] = useState(false);
  const title = state.selected
    ? controller.chatTitle(state.selected)
    : "New chat";
  return (
    <header
      data-testid="native-chat-header"
      className="flex h-10 shrink-0 items-center gap-2 px-3 text-xs font-medium"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Open chat list"
            title="Open chat list"
          >
            <ListIcon className="size-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search chats…" />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {state.catalogLoading ? "Loading chats…" : "No chats found."}
              </CommandEmpty>
              <CommandGroup
                heading={state.catalogArchived ? "Archived chats" : "Chats"}
              >
                {state.sessions.map((id) => (
                  <CommandItem
                    key={id}
                    value={`${controller.chatTitle(id)} ${id}`}
                    disabled={state.profileBusy}
                    onSelect={() => {
                      void controller.select(id);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {controller.chatTitle(id)}
                    </span>
                    {state.selected === id && (
                      <CheckIcon className="size-3.5" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          {state.catalogError && (
            <p role="alert" className="px-3 py-2 text-xs text-destructive">
              {state.catalogError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1 border-t p-1">
            {controller.canOrganizeChats && (
              <Button
                size="xs"
                variant="ghost"
                disabled={state.catalogLoading}
                onClick={() =>
                  void controller.listChats(null, !state.catalogArchived)
                }
              >
                {state.catalogArchived ? "Active chats" : "Archived chats"}
              </Button>
            )}
            {(state.catalogCursor || state.catalogError) && (
              <Button
                size="xs"
                variant="ghost"
                disabled={state.catalogLoading}
                onClick={() => void controller.listChats()}
              >
                Newest chats
              </Button>
            )}
            {state.nextCatalogCursor && (
              <Button
                size="xs"
                variant="ghost"
                disabled={state.catalogLoading}
                onClick={() =>
                  void controller.listChats(state.nextCatalogCursor)
                }
              >
                Older chats
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {state.catalogDraft ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void controller.saveTitle();
          }}
        >
          <Input
            autoFocus
            aria-label="Chat title"
            maxLength={256}
            value={state.catalogDraft.text}
            disabled={state.catalogChanging}
            onChange={(e) => controller.changeTitle(e.target.value)}
            className="h-7 text-xs md:text-xs"
          />
          <Button
            size="icon-xs"
            type="submit"
            variant="ghost"
            disabled={state.catalogChanging}
            aria-label="Save title"
          >
            <CheckIcon className="size-3.5" />
          </Button>
          <Button
            size="icon-xs"
            type="button"
            variant="ghost"
            disabled={state.catalogChanging}
            aria-label="Cancel rename"
            onClick={() => controller.cancelRename()}
          >
            <XIcon className="size-3.5" />
          </Button>
        </form>
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-muted-foreground"
          title={title}
        >
          {title}
          {state.catalogEntry?.archived && " · Archived"}
        </span>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={state.profileBusy}
        aria-label="New chat"
        title="New chat"
        onClick={() => void controller.select(null)}
      >
        <PlusIcon className="size-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Chat options"
            title="Chat options"
          >
            <EllipsisVerticalIcon className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {state.catalogEntry && (
            <>
              <DropdownMenuItem
                disabled={state.catalogChanging}
                onSelect={() => controller.beginRename()}
              >
                Rename chat
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={state.catalogChanging}
                onSelect={() =>
                  void controller.setChatArchived(!state.catalogEntry?.archived)
                }
              >
                {state.catalogEntry.archived ? "Restore chat" : "Archive chat"}
              </DropdownMenuItem>
              {state.catalogEntry.deletionAvailable && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  disabled={!controller.canDeleteSavedChat}
                  onSelect={() => void controller.deleteSavedChat()}
                >
                  Delete chat
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {controller.canOpenSideChat && (
            <DropdownMenuItem onSelect={() => controller.openSideChat()}>
              Open side chat
            </DropdownMenuItem>
          )}
          {state.goal?.goal && (
            <DropdownMenuItem onSelect={onGoal}>Goal details</DropdownMenuItem>
          )}
          {state.subagents && (
            <DropdownMenuItem onSelect={onSubagents}>
              Subagents
            </DropdownMenuItem>
          )}
          {controller.hasContextLimit && (
            <DropdownMenuItem
              disabled={state.contextLimitBusy}
              onSelect={() => void controller.toggleContextLimit()}
            >
              Context settings
            </DropdownMenuItem>
          )}
          {controller.hasHooks && (
            <DropdownMenuItem
              disabled={state.hooksBusy}
              onSelect={() => void controller.toggleHooks()}
            >
              Lifecycle checks
            </DropdownMenuItem>
          )}
          {state.catalogEntryError && (
            <DropdownMenuItem
              onSelect={() => void controller.readChatDetails()}
            >
              Retry chat details
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

/** Effort stops from least to most, as shown on the slider. */
const EFFORT_STOPS = ["low", "medium", "high", "xhigh", "ultra"] as const;
type EffortStop = (typeof EFFORT_STOPS)[number];
const EFFORT_LABEL: Record<EffortStop, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  ultra: "Ultra",
};
const DEFAULT_EFFORT: EffortStop = "medium";

function effortStop(effort: NativeChatEffort | undefined): EffortStop {
  return !effort || effort === "standard" ? DEFAULT_EFFORT : effort;
}

export function NativeModelPicker({
  profiles,
  busy,
  onSelect,
  onRefresh,
  effort,
  onEffort,
  ultraAvailable = false,
  defaultUnavailable,
}: {
  profiles: NativeChatProfileCatalog | null;
  busy: boolean;
  onSelect: (selection: NativeChatProfileSelection) => void;
  onRefresh: () => void;
  effort?: NativeChatEffort;
  onEffort?: (effort: NativeChatEffort) => void;
  /** The connection offers the extended Ultra harness. */
  ultraAvailable?: boolean;
  /** The default connection cannot run; ask for an explicit choice. */
  defaultUnavailable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"effort" | "models">("effort");
  const stop = effortStop(effort);
  const stops = ultraAvailable ? EFFORT_STOPS : EFFORT_STOPS.slice(0, -1);
  const selected =
    profiles?.saved.find((p) => p.id === profiles.active) ??
    profiles?.choices.find((p) => p.id === profiles.active);
  const label =
    selected?.model ??
    (profiles?.active === null && !defaultUnavailable
      ? "Default model"
      : "Choose model");
  // One list of models. A previously used connection keeps its saved identity.
  const models = [
    ...(profiles?.choices ?? []).map((p) => ({
      ...p,
      saved: !!profiles?.saved.some((saved) => saved.id === p.id),
      available: true,
    })),
    ...(profiles?.saved ?? [])
      .filter((saved) => !profiles?.choices.some((p) => p.id === saved.id))
      .map((p) => ({ ...p, saved: true })),
  ];
  const choose = (selection: NativeChatProfileSelection) => {
    onSelect(selection);
    setView("effort");
    if (!onEffort) setOpen(false);
  };
  const showModels = !onEffort || view === "models";
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView("effort");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          role="combobox"
          aria-label="Model connection"
          aria-expanded={open}
          disabled={busy}
          title={
            selected ? `${selected.connection} · ${selected.model}` : label
          }
          className="min-w-0 max-w-52 gap-1.5 px-1.5 font-normal"
        >
          <ConnectionIcon connection={selected?.connection} />
          <span className="truncate">{label}</span>
          {onEffort && stop !== DEFAULT_EFFORT && (
            <span className="text-muted-foreground">{EFFORT_LABEL[stop]}</span>
          )}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-72 max-w-[calc(100vw-2rem)] p-0"
      >
        {!showModels && onEffort && (
          <div
            data-testid="native-effort-panel"
            className="flex flex-col gap-3 p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                <span className="text-sm font-medium text-primary">
                  {EFFORT_LABEL[stop]}
                </span>
                <button
                  type="button"
                  className="flex max-w-full items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setView("models")}
                >
                  <span className="truncate">{label}</span>
                  <ChevronRightIcon className="size-3 shrink-0" />
                </button>
              </div>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label="Reset effort"
                title="Reset effort"
                disabled={stop === DEFAULT_EFFORT}
                onClick={() => onEffort(DEFAULT_EFFORT)}
              >
                <RotateCcwIcon className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
            <Slider
              aria-label="Effort"
              min={0}
              max={stops.length - 1}
              step={1}
              value={[Math.min(stops.indexOf(stop), stops.length - 1)]}
              onValueChange={([index]) => {
                const next = stops[index ?? 0];
                if (next && next !== stop) onEffort(next);
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {stops.map((value) => (
                <span key={value}>{EFFORT_LABEL[value]}</span>
              ))}
            </div>
            {selected && !selected.reasoning && (
              <p className="text-[11px] text-muted-foreground">
                This model uses its own reasoning level.
                {ultraAvailable && " Ultra still extends the work."}
              </p>
            )}
          </div>
        )}
        {showModels && (
          <Command>
            {onEffort && (
              <button
                type="button"
                className="flex items-center gap-1 border-b px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setView("effort")}
              >
                <ChevronLeftIcon className="size-3" />
                Effort
              </button>
            )}
            <CommandInput placeholder="Search models…" />
            <CommandList className="max-h-[min(45vh,20rem)]">
              <CommandEmpty>
                No models found. Add a provider in Settings.
              </CommandEmpty>
              <CommandGroup heading="Models">
                <CommandItem
                  value="Default model"
                  onSelect={() => choose({ kind: "default" })}
                >
                  <GridaLogo className="size-3.5" />
                  Default model
                  {profiles?.active === null && !defaultUnavailable && (
                    <CheckIcon className="ml-auto size-3.5" />
                  )}
                </CommandItem>
                {models.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.connection} ${p.model} ${p.id}`}
                    disabled={!p.available}
                    onSelect={() =>
                      choose({ kind: p.saved ? "saved" : "new", id: p.id })
                    }
                  >
                    <ConnectionIcon connection={p.connection} />
                    <span className="min-w-0 flex-1 truncate">{p.model}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {p.available ? p.connection : "Unavailable"}
                    </span>
                    {profiles?.active === p.id && (
                      <CheckIcon className="size-3.5" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
        <div className="border-t p-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-full justify-start font-normal text-muted-foreground"
            disabled={busy}
            onClick={onRefresh}
          >
            <RefreshCwIcon className="size-3" />
            Refresh models
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ConnectionIcon({ connection }: { connection?: string }) {
  const Icon =
    connection === "OpenRouter"
      ? OpenRouterLogo
      : connection === "Vercel AI Gateway"
        ? VercelLogo
        : connection === "ChatGPT Subscription"
          ? OpenAILogo
          : connection === "Ollama"
            ? OllamaLogo
            : SparklesIcon;
  return <Icon aria-hidden className="size-3.5 shrink-0" />;
}
