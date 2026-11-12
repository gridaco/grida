"use client";

import { useState } from "react";
import type {
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import {
  CheckIcon,
  ChevronDownIcon,
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

export function NativeModelPicker({
  profiles,
  busy,
  onSelect,
  onRefresh,
  effort,
  onEffort,
  defaultUnavailable,
}: {
  profiles: NativeChatProfileCatalog | null;
  busy: boolean;
  /** The default connection cannot run; ask for an explicit choice. */
  defaultUnavailable?: boolean;
  onSelect: (selection: NativeChatProfileSelection) => void;
  onRefresh: () => void;
  effort?: "standard" | "ultra";
  onEffort?: (effort: "standard" | "ultra") => void;
}) {
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
          {effort === "ultra" && (
            <span className="text-muted-foreground">Ultra</span>
          )}
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="w-72 max-w-[calc(100vw-2rem)] p-0"
      >
        <Command>
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
        {onEffort && effort && (
          <div className="flex items-center gap-1 border-t px-2 py-1.5 text-xs">
            <span className="mr-auto text-muted-foreground">Effort</span>
            {(["standard", "ultra"] as const).map((value) => (
              <Button
                key={value}
                size="xs"
                variant={effort === value ? "secondary" : "ghost"}
                onClick={() => onEffort(value)}
              >
                {value === "standard" ? "Standard" : "Ultra"}
              </Button>
            ))}
          </div>
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
