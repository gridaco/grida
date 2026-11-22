"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { defaultFilter } from "cmdk";
import { startOfToday, subDays } from "date-fns";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { toast } from "sonner";
import { app, useDesktopBridge } from "@/lib/desktop/bridge";
import type {
  NativeChatEffort,
  NativeChatSpeed,
  NativeChatTurnCapabilities,
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  RotateCcwIcon,
  EllipsisVerticalIcon,
  EyeOffIcon,
  FolderIcon,
  GitForkIcon,
  HashIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react";
import {
  OpenRouterLogo,
  VercelLogo,
  GridaLogo,
  OllamaLogo,
  OpenAILogo,
} from "@grida/react-icons/logos";
import { Button } from "@app/ui/components/button";
import { chatActivity } from "@/lib/agent-chat/native-chat-activity";
import { ChatActivityIndicators } from "./chat-activity-indicators";
import { cn } from "@app/ui/lib/utils";
import { NativeEffortSlider } from "./native-effort-slider";
import { ComposerControlSkeleton } from "../shared/composer-control-skeleton";
import {
  ComposerToolbarTooltip,
  composerToolbarButtonClassName,
} from "@/kits/composer";
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@app/ui/components/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import {
  NEW_CHAT_TITLE,
  type NativeChatController,
  type NativeChatView,
} from "@/lib/agent-chat/native-chat-controller";
import layout from "./native-chat-layout.module.css";

export function NativeChatHeader({
  controller,
  state,
  workingDirectory,
  disabled = false,
  onChatSelected,
}: {
  controller: NativeChatController;
  state: NativeChatView;
  workingDirectory?: string;
  disabled?: boolean;
  onChatSelected?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pickerOpen = useRef(false);
  const [chatQuery, setChatQuery] = useState("");
  const selecting = useRef(false);
  const renaming = useRef(false);
  const titleInput = useRef<HTMLInputElement>(null);
  const title = state.selected
    ? controller.chatTitle(state.selected)
    : NEW_CHAT_TITLE;
  const entry = state.catalogEntry;
  useEffect(() => {
    if (disabled) return;
    const visible = () => pickerOpen.current && !document.hidden;
    const release = controller.observeChatList(visible);
    const restore = () => {
      if (visible()) void controller.listChats(controller.read().catalogCursor);
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      document.removeEventListener("visibilitychange", restore);
      release();
    };
  }, [controller, disabled]);

  async function archiveChat() {
    const profileId = state.profiles?.active ?? undefined;
    const archived = await controller.setChatArchived(true);
    if (!archived) return;
    const view = {
      label: "View",
      onClick: () => void controller.focusChat(archived.sessionId, profileId),
    };
    const { undo } = archived;
    toast("Chat archived", {
      icon: <ArchiveIcon aria-hidden className="size-4" />,
      ...(undo
        ? {
            cancel: view,
            actionButtonStyle: { marginInlineStart: 0 },
            action: {
              label: "Undo",
              onClick: () => {
                void undo().catch(() => {
                  toast.error("Couldn't undo archiving this chat.");
                });
              },
            },
          }
        : { action: view }),
    });
  }

  async function deleteChat() {
    if (await controller.deleteSavedChat()) {
      toast("Chat deleted", {
        icon: <Trash2Icon aria-hidden className="size-4" />,
      });
    }
  }
  return (
    <header
      data-testid="native-chat-header"
      className={`flex h-10 shrink-0 items-center gap-2 text-xs font-medium ${layout.contentInset}`}
    >
      <Popover
        open={open}
        onOpenChange={(next) => {
          pickerOpen.current = next;
          setOpen(next);
          if (next) {
            selecting.current = false;
            setChatQuery("");
            void controller.listChats(null, false);
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
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
          <Command
            label="Search chats"
            defaultValue={
              !state.profileBusy &&
              state.selected &&
              state.sessions.includes(state.selected)
                ? state.selected
                : undefined
            }
            filter={(id, query) =>
              defaultFilter(`${controller.chatTitle(id)} ${id}`, query)
            }
          >
            <CommandInput
              placeholder="Search chats…"
              value={chatQuery}
              onValueChange={setChatQuery}
            />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {state.catalogLoading ? "Loading chats…" : "No chats found."}
              </CommandEmpty>
              {(chatQuery
                ? [["", state.sessions] as const]
                : chatsByDate(state.sessions, controller)
              ).map(([heading, ids]) => (
                <CommandGroup
                  key={heading}
                  value={heading || "search-results"}
                  heading={heading || undefined}
                >
                  {ids.map((id) => {
                    const readState = controller.chatReadState(id);
                    const row = (
                      <CommandItem
                        key={id}
                        value={id}
                        disabled={state.profileBusy}
                        aria-current={
                          state.selected === id ? "true" : undefined
                        }
                        className="aria-[current=true]:bg-accent"
                        onSelect={() => {
                          selecting.current = true;
                          void controller.select(id);
                          pickerOpen.current = false;
                          setOpen(false);
                        }}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {controller.chatTitle(id)}
                        </span>
                        {readState?.unread && (
                          <span
                            role="img"
                            aria-label="Unread"
                            className="size-2 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        <ChatActivityIndicators {...chatActivity(state, id)} />
                      </CommandItem>
                    );
                    return readState ? (
                      <ContextMenu key={id}>
                        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem
                            onSelect={() => void controller.markChatUnread(id)}
                          >
                            <EyeOffIcon aria-hidden />
                            Mark as unread
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    ) : (
                      row
                    );
                  })}
                </CommandGroup>
              ))}
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
      <ChatActivityIndicators {...chatActivity(state)} running={false} />
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={disabled || state.profileBusy}
        aria-label="New chat"
        title="New chat"
        onClick={() => void controller.select(null)}
      >
        <PlusIcon className="size-4" />
      </Button>
      {(entry || state.catalogEntryError) && (
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
            {entry && (
              <>
                <DropdownMenuItem
                  disabled={state.catalogChanging}
                  onSelect={() => {
                    renaming.current = true;
                    controller.beginRename();
                  }}
                >
                  <PencilIcon aria-hidden />
                  Rename
                </DropdownMenuItem>
                {state.selected && controller.chatReadState(state.selected) && (
                  <DropdownMenuItem
                    onSelect={() =>
                      void controller.markChatUnread(state.selected!)
                    }
                  >
                    <EyeOffIcon aria-hidden />
                    Mark as unread
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {controller.commandChoices.includes("fork") && (
                  <>
                    <DropdownMenuItem
                      disabled={state.acting || !!state.commandRunning}
                      onSelect={() =>
                        void controller
                          .runComposerCommand("fork")
                          .catch(() => {})
                      }
                    >
                      <GitForkIcon aria-hidden />
                      Fork chat
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CopyIcon aria-hidden />
                    Copy
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="w-48">
                      <DropdownMenuItem
                        onSelect={() =>
                          void copyChatValue(entry.sessionId, "Chat ID copied")
                        }
                      >
                        <HashIcon aria-hidden />
                        Copy chat ID
                      </DropdownMenuItem>
                      {workingDirectory && (
                        <DropdownMenuItem
                          onSelect={() =>
                            void copyChatValue(
                              workingDirectory,
                              "Working directory copied"
                            )
                          }
                        >
                          <FolderIcon aria-hidden />
                          Copy working directory
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                {(!entry.archived || entry.deletionAvailable) && (
                  <DropdownMenuSeparator />
                )}
                {!entry.archived && (
                  <DropdownMenuItem
                    disabled={state.catalogChanging}
                    onSelect={() => void archiveChat()}
                  >
                    <ArchiveIcon aria-hidden />
                    Archive
                  </DropdownMenuItem>
                )}
                {entry.deletionAvailable && (
                  <DropdownMenuItem
                    disabled={!controller.canDeleteSavedChat}
                    onSelect={() => void deleteChat()}
                  >
                    <Trash2Icon aria-hidden />
                    Permanently delete
                  </DropdownMenuItem>
                )}
              </>
            )}
            {entry && state.catalogEntryError && <DropdownMenuSeparator />}
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

async function copyChatValue(value: string, confirmation: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(confirmation);
  } catch {
    toast.error("Couldn't copy to the clipboard.");
  }
}

function chatsByDate(ids: readonly string[], controller: NativeChatController) {
  const today = startOfToday().getTime();
  const yesterday = subDays(today, 1).getTime();
  const groups: Record<string, string[]> = {
    Today: [],
    Yesterday: [],
    Earlier: [],
    Undated: [],
  };
  for (const id of ids) {
    const atMs = controller.chatLastActivityAtMs(id);
    if (atMs === undefined) groups.Undated.push(id);
    else if (atMs >= today) groups.Today.push(id);
    else if (atMs >= yesterday) groups.Yesterday.push(id);
    else groups.Earlier.push(id);
  }
  return Object.entries(groups).filter(([, ids]) => ids.length > 0);
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

const RESPONSE_SPEEDS = [
  { value: "standard", label: "Standard", description: "Default speed" },
  {
    value: "fast",
    label: "Fast",
    description: "Faster responses, more usage",
  },
  {
    value: "ultrafast",
    label: "Ultrafast",
    description: "Fastest available responses, more usage",
  },
] as const;

// Keep the rear bolt open from the turn at its crown to the lower tip.
const RESPONSE_SPEED_BOLT_RIGHT_EDGE =
  "M12.5 4.75 13.25 3.75Q14 3 13.75 4.25L12.75 9.5H18.5Q19.5 9.5 18.75 10.5L10.25 20.25";
const RESPONSE_SPEED_BOLT = `${RESPONSE_SPEED_BOLT_RIGHT_EDGE}Q9.25 21.5 9.5 20L10.5 15H5.25Q4.25 15 5 14Z`;

function ResponseSpeedIcon({
  speed,
  className,
}: {
  speed: NativeChatSpeed;
  className: string;
}) {
  const doubled = speed === "ultrafast";
  return (
    <svg
      aria-hidden="true"
      viewBox="1 1 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {doubled && (
        <path
          d={RESPONSE_SPEED_BOLT_RIGHT_EDGE}
          transform="translate(2.75)"
          strokeWidth="1.55"
        />
      )}
      <path
        d={RESPONSE_SPEED_BOLT}
        transform={doubled ? "translate(-2.25)" : undefined}
        fill={speed === "standard" ? undefined : "currentColor"}
      />
    </svg>
  );
}

function effortStop(effort: NativeChatEffort | undefined): EffortStop {
  return !effort || effort === "standard" ? DEFAULT_EFFORT : effort;
}

const OPENAI_MODEL_LIST_ERRORS = {
  unavailable: "Couldn’t load OpenAI API models.",
  keyRejected: "OpenAI rejected the project key. Replace it in Settings.",
  modelsForbidden: "The OpenAI project key needs permission to list models.",
  noCompatibleModels: "This OpenAI project has no compatible models.",
} satisfies Record<
  Exclude<NonNullable<NativeChatProfileCatalog["openAiIssue"]>, "loading">,
  string
>;

const OPENAI_MODEL_REFRESH_INTERVAL_MS = 500;

export function NativeModelPicker({
  profiles,
  busy,
  onSelect,
  onRefresh,
  refreshError,
  loading,
  initialError,
  effort,
  onEffort,
  speed,
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
  /** Initial catalogue or saved selection is still being read. */
  loading?: boolean;
  /** A first read failed before the picker had a resolved selection. */
  initialError?: string | null;
  effort?: NativeChatEffort;
  onEffort?: (effort: NativeChatEffort) => void;
  speed?: {
    value: NativeChatSpeed;
    capabilities: NativeChatTurnCapabilities | null;
    onChange(speed: NativeChatSpeed): void;
    refresh(): void;
  };
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
    (!defaultUnavailable &&
    (profiles?.active === null || (!profiles && !onSelect))
      ? "Default model"
      : !profiles || !onSelect
        ? "Model"
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
  const showEffort = !showModels && !!onEffort;
  const editingEffort = open && showEffort;
  const speedAvailable = !!speed?.capabilities?.speeds.length;
  const activeSpeed =
    speed &&
    RESPONSE_SPEEDS.find(
      ({ value }) =>
        value !== "standard" &&
        value === speed.value &&
        speed.capabilities?.speeds.includes(value)
    );
  const speedDescription = activeSpeed && `${activeSpeed.label} response speed`;
  const speedStatus = speed?.capabilities?.status;
  const speedError =
    speedStatus === "reauthenticationRequired"
      ? "Sign in to ChatGPT again to check faster speeds."
      : speedStatus === "unavailable"
        ? "Couldn’t check available speeds."
        : null;
  const resetSpeed =
    !!speed?.capabilities && speed.value !== "standard" && !speedAvailable;
  const modelListError =
    refreshError ??
    (profiles?.subscriptionIssue === "unavailable"
      ? "Couldn’t load ChatGPT models."
      : profiles?.subscriptionIssue === "reauthenticationRequired"
        ? "Sign in to ChatGPT again to load its models."
        : undefined);
  const openAiIssue = profiles?.openAiIssue;
  const openAiLoading = openAiIssue === "loading" && !refreshError;
  const openAiModelError =
    openAiIssue &&
    openAiIssue !== "loading" &&
    OPENAI_MODEL_LIST_ERRORS[openAiIssue];
  const refreshOpenAi =
    open && showModels && openAiLoading && !busy && !loading && !initialError;
  const refreshModels = useRef(onRefresh);
  useEffect(() => {
    refreshModels.current = onRefresh;
  }, [onRefresh]);
  useEffect(() => {
    if (!refreshOpenAi) return;
    // The profile reader shares overlapping reads. Poll only while the list
    // can show the result of Main's pending discovery.
    const timer = setInterval(
      () => refreshModels.current(),
      OPENAI_MODEL_REFRESH_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [refreshOpenAi]);
  if (initialError)
    return (
      <ComposerToolbarTooltip label={initialError}>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          aria-label="Retry loading models"
          className={cn(
            composerToolbarButtonClassName,
            "w-32 min-w-16 shrink text-muted-foreground"
          )}
          disabled={busy}
          onClick={onRefresh}
        >
          <RotateCcwIcon className="size-3.5" />
          Retry
        </Button>
      </ComposerToolbarTooltip>
    );
  if (loading) return <ComposerControlSkeleton kind="model" />;
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
          speed?.refresh();
          if (onSelect && !onEffort) onRefresh();
        }
      }}
    >
      <ComposerToolbarTooltip
        label={
          speedDescription
            ? `Select efforts & models · ${speedDescription}`
            : "Select efforts & models"
        }
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            role="combobox"
            aria-label={editingEffort ? "Select effort" : "Model connection"}
            aria-description={speedDescription}
            aria-expanded={open}
            disabled={busy}
            className={cn(
              composerToolbarButtonClassName,
              "min-w-16 max-w-52 shrink gap-1.5 px-1.5 font-normal",
              editingEffort && "text-muted-foreground"
            )}
          >
            {activeSpeed ? (
              <ResponseSpeedIcon
                speed={activeSpeed.value}
                className="size-3.5 shrink-0"
              />
            ) : (
              <ConnectionIcon connection={selected?.connection} />
            )}
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
      </ComposerToolbarTooltip>
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
          <div ref={measurePanel} className="relative">
            {showEffort && (
              <div
                data-testid="native-effort-panel"
                className="flex flex-col gap-3 p-3"
              >
                <div className="relative px-8">
                  <DropdownMenu
                    key={
                      speedAvailable ? "speed-available" : "speed-unavailable"
                    }
                    modal={false}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="absolute top-0 left-0"
                        aria-label="Response speed"
                        aria-description={speedDescription}
                        title="Response speed"
                        disabled={busy || !speedAvailable}
                      >
                        <ResponseSpeedIcon
                          speed={activeSpeed?.value ?? "standard"}
                          className="size-3.5 text-muted-foreground"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    {speedAvailable && speed && (
                      <DropdownMenuContent
                        side="right"
                        align="start"
                        collisionPadding={12}
                        className="w-60 max-w-[calc(100vw-1.5rem)] rounded-xl"
                      >
                        <DropdownMenuRadioGroup value={speed.value}>
                          {RESPONSE_SPEEDS.map(
                            ({ value, label, description }) => (
                              <DropdownMenuPrimitive.RadioItem
                                key={value}
                                value={value}
                                textValue={label}
                                disabled={
                                  busy ||
                                  (value !== "standard" &&
                                    !speed.capabilities?.speeds.includes(value))
                                }
                                onSelect={() => {
                                  if (value !== speed.value)
                                    speed.onChange(value);
                                }}
                                className="flex cursor-default items-center gap-3 rounded-lg px-2.5 py-1.5 outline-none select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:opacity-50"
                              >
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="text-sm font-medium">
                                    {label}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {description}
                                  </span>
                                </span>
                                <DropdownMenuPrimitive.ItemIndicator>
                                  <CheckIcon
                                    aria-hidden="true"
                                    className="size-3.5"
                                  />
                                </DropdownMenuPrimitive.ItemIndicator>
                              </DropdownMenuPrimitive.RadioItem>
                            )
                          )}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
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
                          {label === "Default model"
                            ? "This chat uses the default model"
                            : label}
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
                <div className="flex h-12 items-center gap-1 border-b px-3">
                  {onEffort && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Back to effort"
                      onClick={() => setView("effort")}
                    >
                      <ChevronLeftIcon className="size-3" />
                    </Button>
                  )}
                  <span className="text-xs font-medium">Models</span>
                </div>
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
                              void app.openSettings("models").catch(() => {
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
            {showEffort && speed && (speedError || resetSpeed) && (
              <div className="flex flex-wrap items-center gap-1.5 border-t px-3 py-2">
                {speedError && (
                  <p className="w-full text-xs text-muted-foreground">
                    {speedError}
                  </p>
                )}
                {speedStatus === "unavailable" && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={speed.refresh}
                  >
                    Retry availability
                  </Button>
                )}
                {resetSpeed && (
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => speed.onChange("standard")}
                  >
                    Use Standard
                  </Button>
                )}
              </div>
            )}
            {showModels && settingsError && (
              <p role="alert" className="px-3 py-2 text-xs text-destructive">
                {settingsError}
              </p>
            )}
            {showModels && openAiLoading && (
              <p
                role="status"
                className="px-3 py-2 text-xs text-muted-foreground"
              >
                Loading OpenAI API models…
              </p>
            )}
            {showModels && (modelListError || openAiModelError) && (
              <div
                role="alert"
                className="flex items-center gap-2 px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-muted-foreground">
                  {modelListError && <span>{modelListError}</span>}
                  {openAiModelError && <span>{openAiModelError}</span>}
                </div>
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
        : connection === "ChatGPT Subscription" ||
            connection === "OpenAI API · Project billing"
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
