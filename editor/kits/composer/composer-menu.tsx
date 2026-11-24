"use client";

import {
  createContext,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PlusIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerToolbarTooltip,
  composerToolbarButtonClassName,
} from "./composer-toolbar";
import {
  useComposer,
  useComposerInternals,
  type ComposerCommand,
  type ComposerMention,
} from "./composer-react";

const Anchor = createContext<HTMLElement | null>(null);

/** One full-width anchor for completion and toolbar menus, above the composer. */
export function ComposerMenuAnchor({
  children,
  className,
  onClick,
  onPointerDown,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null);
  const { editor } = useComposerInternals();
  const focusDraft = (event: MouseEvent<HTMLDivElement>) => {
    const { currentTarget, target } = event;
    if (
      !editor?.isEditable ||
      event.defaultPrevented ||
      event.button !== 0 ||
      !(target instanceof Element) ||
      !currentTarget.contains(target)
    )
      return;
    const control = target.closest(
      "button, a[href], input, select, textarea, label, summary, [tabindex], [contenteditable], [data-composer-action-menu], [data-composer-trigger-menu], [data-composer-formatting]"
    );
    if (control && currentTarget.contains(control)) return;
    event.preventDefault();
    editor.commands.focus("end");
  };
  return (
    <Anchor.Provider value={anchor}>
      <div
        {...props}
        ref={setAnchor}
        className={cn("relative", className)}
        data-composer-menu-anchor
        onPointerDown={(event) => {
          onPointerDown?.(event);
          focusDraft(event);
        }}
        onClick={(event) => {
          onClick?.(event);
          // Clicks without pointer-down also activate the composer surface.
          if (
            !editor?.view.hasFocus() &&
            event.currentTarget.ownerDocument.getSelection()?.isCollapsed !==
              false
          )
            focusDraft(event);
        }}
      >
        {children}
      </div>
    </Anchor.Provider>
  );
}

/** Internal shared surface. Portaling to the composer avoids clipped toolbars. */
export function ComposerMenuSurface({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }) {
  const anchor = useContext(Anchor);
  const panel = (
    <div
      {...props}
      className={cn(
        "absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-xl border border-border bg-background shadow-lg",
        className
      )}
    />
  );
  return anchor ? createPortal(panel, anchor) : panel;
}

export type ComposerMenuAction = Readonly<{
  id: string;
  title: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect(): void;
}>;

/** Toolbar actions use the same placement and list presentation as completion. */
export function ComposerActionMenu({
  items,
  label = "Add to message",
  tooltip = label,
  className,
}: {
  items: readonly ComposerMenuAction[];
  label?: string;
  tooltip?: string;
  className?: string;
}) {
  const composer = useComposer();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const command = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (composer.trigger) setOpen(false);
  }, [composer.trigger]);

  useEffect(() => {
    if (!open) return;
    command.current?.focus();
    const dismiss = (event: Event) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target) &&
        !button.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("focusin", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("focusin", dismiss);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <>
      <ComposerToolbarTooltip label={tooltip}>
        <Button
          ref={button}
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open && !composer.trigger}
          className={cn(
            composerToolbarButtonClassName,
            "w-7 text-muted-foreground",
            className
          )}
          onClick={() => {
            composer.dismissTrigger();
            setOpen((previous) => !previous);
          }}
        >
          <PlusIcon className="size-4" />
        </Button>
      </ComposerToolbarTooltip>
      {open && !composer.trigger && (
        <ComposerMenuSurface ref={panel} data-composer-action-menu>
          <Command
            ref={command}
            tabIndex={-1}
            className="bg-transparent outline-none"
            loop
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              button.current?.focus();
            }}
          >
            <CommandList
              aria-label={label}
              className="max-h-64 scroll-py-1 p-1 outline-none"
            >
              <CommandGroup className="p-0">
                {items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    disabled={item.disabled}
                    className="scroll-my-1 items-center py-1"
                    onMouseDown={(event) => event.preventDefault()}
                    onSelect={() => {
                      setOpen(false);
                      composer.focus();
                      item.onSelect();
                    }}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      {item.icon && (
                        <span className="shrink-0 text-muted-foreground [&_svg]:size-4">
                          {item.icon}
                        </span>
                      )}
                      <span className="max-w-full shrink-0 truncate font-normal">
                        {item.title}
                      </span>
                      {item.description && (
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {item.description}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </ComposerMenuSurface>
      )}
    </>
  );
}

export function ComposerTriggerMenu({
  className,
  id,
}: {
  className?: string;
  id?: string;
}) {
  const composer = useComposer();
  const { triggerMenuId, core } = useComposerInternals();
  const resolvedId = id ?? triggerMenuId;
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const trigger = composer.trigger;
  const open = !!trigger && trigger.items.length > 0;

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.current?.contains(event.target)
      )
        core.dismissTrigger();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [core, open]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [composer.triggerIndex, trigger?.kind, trigger?.query]);

  if (!trigger || trigger.items.length === 0) return null;

  const itemValues = trigger.items.map((item) => `${trigger.kind}:${item.id}`);
  const selectedValue =
    itemValues[composer.triggerIndex] ?? itemValues[0] ?? "";

  return (
    <ComposerMenuSurface
      ref={panel}
      className={className}
      data-composer-trigger-menu
      id={resolvedId}
    >
      <Command
        className="bg-transparent"
        shouldFilter={false}
        value={selectedValue}
        onValueChange={(value) => {
          const index = itemValues.indexOf(value);
          if (index >= 0) composer.setTriggerIndex(index);
        }}
      >
        <CommandList
          aria-label={
            trigger.kind === "command"
              ? "Commands"
              : trigger.kind === "skill"
                ? "Skills"
                : "Mentions"
          }
          className="max-h-64 scroll-py-1 p-1 outline-none"
        >
          <CommandGroup className="p-0">
            {trigger.items.map((item, index) => {
              const description =
                trigger.kind === "command"
                  ? (item as ComposerCommand).description
                  : getMentionDescription(item as ComposerMention);
              return (
                <CommandItem
                  className="scroll-my-1 items-center py-1"
                  key={itemValues[index]}
                  ref={(node) => {
                    if (node) {
                      node.id = `${resolvedId}-${trigger.kind}-${item.id}`;
                    }
                    if (index === composer.triggerIndex) {
                      selectedRef.current = node;
                    }
                  }}
                  value={itemValues[index]}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onMouseMove={() => composer.setTriggerIndex(index)}
                  onSelect={() => {
                    composer.selectTriggerItem(index);
                  }}
                >
                  {/* Title takes priority. `shrink-0` keeps it at full width
                      so the description — the only flexible sibling (`flex-1`)
                      — is what yields and truncates when the row is tight.
                      `max-w-full truncate` on the title only kicks in when the
                      title alone is wider than the whole row. (A `shrink` ratio
                      doesn't work here: flexbox distributes shrink by
                      `shrink × content-width`, so a long description still
                      forces the title to give up space.) */}
                  <span className="flex w-full min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {trigger.kind === "command"
                        ? "/"
                        : trigger.kind === "skill"
                          ? "$"
                          : "@"}
                    </span>
                    <span className="max-w-full shrink-0 truncate font-normal">
                      {trigger.kind === "command"
                        ? (item as ComposerCommand).title
                        : (item as ComposerMention).label}
                    </span>
                    {trigger.kind === "skill" &&
                      (item as ComposerMention).source && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {(item as ComposerMention).source}
                        </span>
                      )}
                    {description && (
                      <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                        {description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </ComposerMenuSurface>
  );
}

function getMentionDescription(mention: ComposerMention): string | undefined {
  if (mention.kind === "file" || mention.kind === "folder") return undefined;
  return mention.description;
}
