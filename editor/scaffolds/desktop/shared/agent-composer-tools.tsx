"use client";

import { useState, type ReactNode } from "react";
import type { NativeChatPermissionMode } from "@grida/desktop-bridge";
import { CheckIcon, ShieldIcon, ShieldAlertIcon, XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { ComposerActionMenu, type ComposerMenuAction } from "@/kits/composer";

/** Composer toolbar presentation; the caller owns actions, intents and state. */
export function AgentComposerTools({
  actions,
  intents = [],
  access,
  children,
}: AgentComposerTools.Props) {
  const [accessOpen, setAccessOpen] = useState(false);
  const full = access?.mode === "full_access";
  const label = access?.uncertain
    ? "Access unknown"
    : full
      ? "Full access"
      : "Default";
  return (
    <>
      <ComposerActionMenu items={actions} />
      <Popover open={accessOpen} onOpenChange={setAccessOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={`shrink-0 gap-1 rounded-xl px-1.5 ${full ? "text-amber-600 hover:text-amber-600" : "text-muted-foreground"}`}
            aria-label={`Access: ${label}`}
            disabled={access?.busy}
          >
            {full ? (
              <ShieldAlertIcon className="size-3.5" />
            ) : (
              <ShieldIcon className="size-3.5" />
            )}
            <span className="hidden @[26rem]:inline">{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-80 rounded-xl p-1 text-sm"
        >
          <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
            {access?.staged
              ? "What can the new chat access?"
              : "What can the agent access?"}
          </p>
          <button
            type="button"
            aria-pressed={!full && !access?.uncertain}
            disabled={!access?.available || access.busy}
            onClick={() => {
              setAccessOpen(false);
              access?.onChange("restricted");
            }}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default"
          >
            <ShieldIcon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>Default</p>
              <p className="text-xs text-muted-foreground">
                Reads and edits this project's files and runs sandboxed
                commands. Commands cannot use the internet.
              </p>
            </div>
            {!full && !access?.uncertain && (
              <CheckIcon className="mt-0.5 size-4 shrink-0" />
            )}
          </button>
          <button
            type="button"
            aria-pressed={full && !access?.uncertain}
            disabled={!access?.available || access.busy}
            onClick={() => {
              setAccessOpen(false);
              access?.onChange("full_access");
            }}
            className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-amber-600 hover:bg-muted disabled:opacity-50"
          >
            <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>Full access</p>
              <p className="text-xs">
                Uses the internet and any file your account can access. Commands
                run without a sandbox or approval prompts.
              </p>
            </div>
            {full && !access?.uncertain && (
              <CheckIcon className="mt-0.5 size-4 shrink-0" />
            )}
          </button>
          {!access?.available && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {access?.staged
                ? "Full access requires a compatible Desktop build."
                : "Open a project in a supported Desktop build to choose Full access."}
            </p>
          )}
          {access?.onRetry && access.error && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={access.busy}
              onClick={access.onRetry}
            >
              Check access
            </Button>
          )}
          {access?.error && (
            <p role="status" className="px-2 py-1.5 text-xs text-destructive">
              {access.error}
            </p>
          )}
        </PopoverContent>
      </Popover>
      {children}
      {intents.map((intent) => (
        <button
          key={intent.id}
          type="button"
          disabled={intent.disabled}
          aria-label={`Remove ${intent.label.toLowerCase()}`}
          title={`Remove ${intent.label.toLowerCase()}`}
          onClick={intent.onRemove}
          className="group/chip flex h-6 shrink-0 items-center gap-1 rounded-xl px-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5"
        >
          <span className="group-hover/chip:hidden group-focus-visible/chip:hidden">
            {intent.icon}
          </span>
          <XIcon className="hidden group-hover/chip:block group-focus-visible/chip:block" />
          {intent.label}
        </button>
      ))}
    </>
  );
}

export namespace AgentComposerTools {
  export type Intent = Readonly<{
    id: string;
    icon: ReactNode;
    label: string;
    disabled?: boolean;
    onRemove(): void;
  }>;
  export type Props = Readonly<{
    actions: readonly ComposerMenuAction[];
    access?: Readonly<{
      mode: NativeChatPermissionMode;
      available: boolean;
      staged?: boolean;
      uncertain?: boolean;
      onRetry?(): void;
      busy: boolean;
      error?: string | null;
      onChange(mode: NativeChatPermissionMode): void;
    }>;
    intents?: readonly Intent[];
    /** Additional toolbar controls, before the intent chips. */
    children?: ReactNode;
  }>;
}
