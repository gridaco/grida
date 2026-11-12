"use client";

import { useEffect, useRef, useState } from "react";
import type {
  NativeChatEffort,
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RotateCcwIcon,
  EllipsisVerticalIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react";
import {
  OpenRouterLogo,
  VercelLogo,
  GridaLogo,
  OllamaLogo,
  OpenAILogo,
} from "@grida/react-icons/logos";
import { Button } from "@app/ui/components/button";
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
import {
  NEW_CHAT_TITLE,
  type NativeChatController,
  type NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";

export function NativeChatHeader({
  controller,
  state,
}: {
  controller: NativeChatController;
  state: NativeChatView;
}) {
  const [open, setOpen] = useState(false);
  const renaming = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const title = state.selected
    ? controller.chatTitle(state.selected)
    : NEW_CHAT_TITLE;
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
        <ChatTitleInput
          inputRef={titleInput}
          focusOnMount={!renaming.current}
          value={state.catalogDraft.text}
          disabled={state.catalogChanging}
          onChange={(text) => controller.changeTitle(text)}
          onCommit={() => void controller.saveTitle()}
          onCancel={() => controller.cancelRename()}
        />
      ) : (
        <span
          className="min-w-0 flex-1 truncate text-muted-foreground"
          title={title}
          onDoubleClick={() => controller.beginRename()}
        >
          <ChatTitleText
            key={state.selected ?? "new"}
            text={title}
            reveal={!!state.selected && state.titleArrived === state.selected}
          />
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
        <DropdownMenuContent
          align="end"
          className="w-52"
          onCloseAutoFocus={(e) => {
            // Hand focus to the title field a rename just opened, with the
            // whole title selected.
            if (renaming.current) {
              e.preventDefault();
              selectAll(titleInput.current);
              requestAnimationFrame(() => selectAll(titleInput.current));
            }
            renaming.current = false;
          }}
        >
          {state.catalogEntry && (
            <>
              <DropdownMenuItem
                disabled={state.catalogChanging}
                onSelect={() => {
                  renaming.current = true;
                  controller.beginRename();
                }}
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
            </>
          )}
          {state.catalogEntry && state.catalogEntryError && (
            <DropdownMenuSeparator />
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
  const stops = EFFORT_STOPS;
  const selected =
    profiles?.saved.find((p) => p.id === profiles.active) ??
    profiles?.choices.find((p) => p.id === profiles.active);
  const label =
    selected?.model ??
    (!profiles
      ? "Model"
      : profiles.active === null && !defaultUnavailable
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
  // Ultra is a property of the chosen model's connection, known before any
  // chat starts. The running connection can also confirm it.
  const ultra = ultraAvailable || selected?.ultra === true;
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
          className="min-w-16 max-w-52 shrink gap-1.5 px-1.5 font-normal"
        >
          <span className="truncate">{label}</span>
          {onEffort && (
            <span className="shrink-0 text-muted-foreground">
              {EFFORT_LABEL[stop]}
            </span>
          )}
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
                if (next && next !== stop && (next !== "ultra" || ultra))
                  onEffort(next);
              }}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {stops.map((value) => (
                <span
                  key={value}
                  className={
                    value === "ultra" && !ultra ? "opacity-50" : undefined
                  }
                >
                  {EFFORT_LABEL[value]}
                </span>
              ))}
            </div>
            {selected && !selected.reasoning && (
              <p className="text-[11px] text-muted-foreground">
                This model uses its own reasoning level.
                {ultra && " Ultra still extends the work."}
              </p>
            )}
            {!ultra && (
              <p className="text-[11px] text-muted-foreground">
                {selected
                  ? "Ultra needs a Grida, OpenRouter or Vercel AI Gateway model."
                  : "Choose a model to use Ultra."}
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
              <CommandGroup heading="Select model">
                <CommandItem
                  value="Default model"
                  onSelect={() => choose({ kind: "default" })}
                >
                  <GridaLogo className="size-3.5" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span>Default</span>
                    <span className="text-[10px] text-muted-foreground">
                      Recommended model
                    </span>
                  </span>
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

/**
 * Renames the chat in place: the title itself becomes editable, selected and
 * in the same type. Enter or leaving the field saves; Escape cancels.
 */
function ChatTitleInput({
  inputRef,
  focusOnMount,
  value,
  disabled,
  onChange,
  onCommit,
  onCancel,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** False when a closing menu hands focus over instead. */
  focusOnMount: boolean;
  value: string;
  disabled: boolean;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const cancelled = useRef(false);
  const focus = useRef(focusOnMount);
  useEffect(() => {
    if (focus.current) selectAll(inputRef.current);
  }, [inputRef]);
  return (
    <input
      ref={inputRef}
      aria-label="Chat title"
      maxLength={256}
      value={value}
      disabled={disabled}
      placeholder={NEW_CHAT_TITLE}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          onCancel();
        }
      }}
      onBlur={() => {
        if (!cancelled.current) onCommit();
      }}
      // Outlined so editing reads differently from selected text; the
      // negative margin keeps the text where the title was.
      className="-mx-1 min-w-0 flex-1 truncate rounded-sm border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-foreground outline-none ring-1 ring-ring"
    />
  );
}

function selectAll(input: HTMLInputElement | null) {
  if (!input) return;
  input.focus();
  input.select();
}

/** How long a newly arrived title takes to type in. */
const TITLE_REVEAL_MS = 600;

/**
 * A chat title. When `reveal` turns on, the title types in from the left so
 * the person notices it replace the new-chat label; it appears at once when
 * they prefer reduced motion.
 */
function ChatTitleText({ text, reveal }: { text: string; reveal: boolean }) {
  const characters = Array.from(text);
  const [shown, setShown] = useState(characters.length);
  useEffect(() => {
    const total = Array.from(text).length;
    if (
      !reveal ||
      total === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(total);
      return;
    }
    setShown(0);
    const started = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const next = Math.ceil(
        (Math.min(now - started, TITLE_REVEAL_MS) / TITLE_REVEAL_MS) * total
      );
      setShown(next);
      if (next < total) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [text, reveal]);
  if (shown >= characters.length) return <>{text}</>;
  return (
    <span aria-label={text}>
      <span aria-hidden>{characters.slice(0, shown).join("")}</span>
      <span aria-hidden className="animate-pulse text-foreground/40">
        {shown > 0 ? "▍" : ""}
      </span>
    </span>
  );
}
