"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { app, useDesktopBridge } from "@/lib/desktop/bridge";
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
  SparklesIcon,
  SettingsIcon,
} from "lucide-react";
import {
  OpenRouterLogo,
  VercelLogo,
  GridaLogo,
  OllamaLogo,
  OpenAILogo,
} from "@grida/react-icons/logos";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import { NativeEffortSlider } from "./native-effort-slider";
import { ChatActivityDate } from "../shared/chat-activity-date";
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
  onChatSelected,
}: {
  controller: NativeChatController;
  state: NativeChatView;
  onChatSelected?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selecting = useRef(false);
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
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            selecting.current = false;
            void controller.listChats(null, false);
          }
        }}
      >
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
        <PopoverContent
          align="start"
          className="w-72 p-0"
          onCloseAutoFocus={(event) => {
            // Selecting a chat hands focus to its composer; dismissing the
            // list still returns focus to its trigger.
            if (selecting.current) {
              event.preventDefault();
              onChatSelected?.();
            }
            selecting.current = false;
          }}
        >
          <Command>
            <CommandInput placeholder="Search chats…" />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {state.catalogLoading ? "Loading chats…" : "No chats found."}
              </CommandEmpty>
              <CommandGroup heading="Chats">
                {state.sessions.map((id) => (
                  <CommandItem
                    key={id}
                    value={`${controller.chatTitle(id)} ${id}`}
                    disabled={state.profileBusy}
                    onSelect={() => {
                      selecting.current = true;
                      void controller.select(id);
                      setOpen(false);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {controller.chatTitle(id)}
                    </span>
                    <ChatActivityDate
                      atMs={controller.chatLastActivityAtMs(id)}
                    />
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
          {(state.catalogCursor ||
            state.catalogError ||
            state.nextCatalogCursor) && (
            <div className="flex flex-wrap items-center gap-1 border-t p-1">
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
          )}
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
            onRevealed={() => controller.acknowledgeTitle()}
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
      {(state.catalogEntry || state.catalogEntryError) && (
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
                {!state.catalogEntry.archived && (
                  <DropdownMenuItem
                    disabled={state.catalogChanging}
                    onSelect={() => {
                      void controller.setChatArchived(true).then((archived) => {
                        if (archived) toast("Chat archived");
                      });
                    }}
                  >
                    Archive chat
                  </DropdownMenuItem>
                )}
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
      )}
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
  refreshError,
  effort,
  onEffort,
  ultraAvailable,
  ultraOffered = true,
  defaultUnavailable,
  goal = false,
}: {
  profiles: NativeChatProfileCatalog | null;
  busy: boolean;
  /**
   * Choose another model. Absent when this chat runs on a fixed connection,
   * such as a deck nested in a project; the picker then offers effort only.
   */
  onSelect?: (selection: NativeChatProfileSelection) => void;
  onRefresh: () => void;
  /** Last catalogue reload failed; existing choices remain usable. */
  refreshError?: string | null;
  effort?: NativeChatEffort;
  onEffort?: (effort: NativeChatEffort) => void;
  /** Negotiated harness support; absent until the installed host is checked. */
  ultraAvailable?: boolean;
  /**
   * False when this chat cannot use Ultra on any connection, such as a side
   * chat; effort then stops at Extra high.
   */
  ultraOffered?: boolean;
  /** The default connection cannot run; ask for an explicit choice. */
  defaultUnavailable?: boolean;
  /** The next send starts a goal, whose turns keep the model's reasoning. */
  goal?: boolean;
}) {
  const desktop = useDesktopBridge();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"effort" | "models">("effort");
  const [allModels, setAllModels] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [panelHeight, setPanelHeight] = useState<number>();
  const reducedMotion = useReducedMotion();
  const measurePanel = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => setPanelHeight(node.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  const stop = effortStop(effort);
  const stops: readonly EffortStop[] = ultraOffered
    ? EFFORT_STOPS
    : EFFORT_STOPS.filter((value) => value !== "ultra");
  const selected =
    profiles?.saved.find((p) => p.id === profiles.active) ??
    profiles?.choices.find((p) => p.id === profiles.active);
  const label =
    selected?.model ??
    (!onSelect
      ? "Default model"
      : !profiles
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
  // Keep the current connection close at hand; search always spans the catalogue.
  // (see test/desktop-agent-chat-model-refresh.md)
  const nearbyModels = selected
    ? models
        .filter(
          (p) => p.connection === selected.connection && p.id !== selected.id
        )
        .slice(0, 4)
    : models;
  const compact = !!selected && !allModels && !modelSearch.trim();
  const visibleModels = compact
    ? models.filter((p) => p.id === selected.id || nearbyModels.includes(p))
    : models;
  const modelGroups = Array.from(
    new Set(visibleModels.map((p) => p.connection)),
    (connection) => ({
      connection,
      models: visibleModels.filter((p) => p.connection === connection),
    })
  );
  // Catalogue support can offer Ultra before startup; an actual negotiated
  // refusal takes precedence over that optimistic installed-host metadata.
  const ultra = ultraOffered && (ultraAvailable ?? selected?.ultra === true);
  const choose = (selection: NativeChatProfileSelection) => {
    onSelect?.(selection);
    setView("effort");
    setAllModels(false);
    setModelSearch("");
    if (!onEffort) setOpen(false);
  };
  // Model-list entry reloads choices; effort changes leave them alone.
  // (see test/desktop-agent-chat-model-refresh.md)
  const showModels = !!onSelect && (!onEffort || view === "models");
  const editingEffort = open && !showModels && !!onEffort;
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPanelHeight(undefined);
          setView("effort");
          setAllModels(false);
          setModelSearch("");
          setSettingsError(null);
          if (onSelect && !onEffort) onRefresh();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          role="combobox"
          aria-label={editingEffort ? "Select effort" : "Model connection"}
          aria-expanded={open}
          disabled={busy}
          title={
            editingEffort
              ? "Select effort"
              : selected
                ? `${selected.connection} · ${selected.model}`
                : label
          }
          className={cn(
            "min-w-16 max-w-52 shrink gap-1.5 rounded-xl px-1.5 font-normal",
            open && "bg-muted px-3",
            editingEffort && "text-muted-foreground"
          )}
        >
          <ConnectionIcon connection={selected?.connection} />
          <span className="truncate">
            {editingEffort ? "Select effort" : label}
          </span>
          {onEffort && !editingEffort && (
            <span className="shrink-0 text-muted-foreground">
              {EFFORT_LABEL[stop]}
            </span>
          )}
          {open && !editingEffort && (
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3 shrink-0 text-muted-foreground"
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl p-0"
      >
        <motion.div
          initial={false}
          animate={{ height: panelHeight ?? "auto" }}
          transition={{
            type: "tween",
            duration: reducedMotion ? 0 : 0.18,
            ease: "easeOut",
          }}
          className="overflow-hidden"
        >
          <div ref={measurePanel}>
            {!showModels && onEffort && (
              <div
                data-testid="native-effort-panel"
                className="flex flex-col gap-3 p-3"
              >
                <div className="relative px-8">
                  <div className="flex min-w-0 flex-col items-center gap-0.5">
                    <span className="text-sm font-medium text-primary">
                      {EFFORT_LABEL[stop]}
                    </span>
                    {onSelect ? (
                      <button
                        type="button"
                        className="flex max-w-full items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setView("models");
                          setAllModels(false);
                          setModelSearch("");
                          onRefresh();
                        }}
                      >
                        <ConnectionIcon connection={selected?.connection} />
                        <span className="truncate">{label}</span>
                        <ChevronRightIcon className="size-3 shrink-0" />
                      </button>
                    ) : (
                      <span className="flex max-w-full items-center gap-1 text-xs text-muted-foreground">
                        {selected && (
                          <ConnectionIcon connection={selected.connection} />
                        )}
                        <span className="truncate">
                          {selected
                            ? label
                            : "This chat uses the default model"}
                        </span>
                      </span>
                    )}
                  </div>
                  {stop !== DEFAULT_EFFORT && (
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      className="absolute top-0 right-0"
                      aria-label="Reset effort"
                      title="Reset effort"
                      onClick={() => onEffort(DEFAULT_EFFORT)}
                    >
                      <RotateCcwIcon className="size-3.5 text-muted-foreground" />
                    </Button>
                  )}
                </div>
                <NativeEffortSlider
                  labels={stops.map((value) => EFFORT_LABEL[value])}
                  value={Math.min(stops.indexOf(stop), stops.length - 1)}
                  onValueChange={(index) => {
                    const next = stops[index];
                    if (next && next !== stop && (next !== "ultra" || ultra))
                      onEffort(next);
                  }}
                />
                {goal && (
                  <p className="text-[11px] text-muted-foreground">
                    Goal turns use the model&apos;s default reasoning. Ultra
                    adds an independent review.
                  </p>
                )}
                {!goal && selected && !selected.reasoning && (
                  <p className="text-[11px] text-muted-foreground">
                    This model uses its own reasoning level.
                    {ultra && " Ultra still extends the work."}
                  </p>
                )}
              </div>
            )}
            {showModels && (
              <Command>
                {onEffort && (
                  <div className="flex items-center gap-1 border-b px-2 py-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Back to effort"
                      onClick={() => setView("effort")}
                    >
                      <ChevronLeftIcon className="size-3" />
                    </Button>
                    <span className="text-xs font-medium">Models</span>
                  </div>
                )}
                <CommandInput
                  placeholder="Search all models…"
                  value={modelSearch}
                  onValueChange={setModelSearch}
                />
                <CommandList className="max-h-[min(45vh,20rem)]">
                  <CommandEmpty>
                    {modelSearch.trim()
                      ? "No models match your search."
                      : "No models found. Add a provider in Settings."}
                  </CommandEmpty>
                  {!compact && (
                    <CommandGroup>
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
                    </CommandGroup>
                  )}
                  {modelGroups.map((group) => (
                    <CommandGroup
                      key={group.connection}
                      heading={group.connection}
                    >
                      {group.models.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.connection} ${p.model} ${p.id}`}
                          disabled={!p.available}
                          onSelect={() =>
                            choose({
                              kind: p.saved ? "saved" : "new",
                              id: p.id,
                            })
                          }
                        >
                          <ConnectionIcon connection={p.connection} />
                          <span className="min-w-0 flex-1 truncate">
                            {p.model}
                          </span>
                          {!p.available && (
                            <span className="text-[10px] text-muted-foreground">
                              Unavailable
                            </span>
                          )}
                          {profiles?.active === p.id && (
                            <CheckIcon className="size-3.5" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ))}
                  {!modelSearch.trim() &&
                    (compact || desktop?.window.open_settings) && (
                      <CommandGroup className="border-t">
                        <CommandItem
                          value={compact ? "Show all models" : "Manage models"}
                          onSelect={() => {
                            if (compact) {
                              setAllModels(true);
                            } else {
                              setOpen(false);
                              void app.openSettings().catch(() => {
                                setSettingsError(
                                  "Couldn't open Settings. Restart Desktop and try again."
                                );
                                setView("models");
                                setOpen(true);
                              });
                            }
                          }}
                          className="text-muted-foreground"
                        >
                          {!compact && <SettingsIcon className="size-3.5" />}
                          {compact ? "Show all models" : "Manage models"}
                          <ChevronRightIcon className="ml-auto size-3.5" />
                        </CommandItem>
                      </CommandGroup>
                    )}
                </CommandList>
              </Command>
            )}
            {showModels && settingsError && (
              <p role="alert" className="px-3 py-2 text-xs text-destructive">
                {settingsError}
              </p>
            )}
            {showModels && refreshError && (
              <div
                role="alert"
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {refreshError}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={busy}
                  onClick={onRefresh}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>
        </motion.div>
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
function ChatTitleText({
  text,
  reveal,
  onRevealed,
}: {
  text: string;
  reveal: boolean;
  /** Called once the title is fully shown, so it is revealed only once. */
  onRevealed: () => void;
}) {
  const characters = Array.from(text);
  const [shown, setShown] = useState(characters.length);
  const revealed = useRef(onRevealed);
  revealed.current = onRevealed;
  useEffect(() => {
    const total = Array.from(text).length;
    if (
      !reveal ||
      total === 0 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setShown(total);
      if (reveal) revealed.current();
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
      else revealed.current();
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
