"use client";

import type { ReactNode } from "react";
import { CheckIcon, ShieldIcon, XIcon } from "lucide-react";
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
  children,
}: AgentComposerTools.Props) {
  return (
    <>
      <ComposerActionMenu items={actions} />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="shrink-0 gap-1 rounded-xl px-1.5 text-muted-foreground"
            aria-label="Access: Default"
          >
            <ShieldIcon className="size-3.5" />
            <span className="hidden @[26rem]:inline">Default</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-80 rounded-xl p-1 text-sm"
        >
          <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
            What can the agent access?
          </p>
          <div className="flex items-start gap-2 rounded-md px-2 py-1.5">
            <ShieldIcon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>Default</p>
              <p className="text-xs text-muted-foreground">
                Reads and edits files in this project and runs commands in a
                sandbox. Other folders and the internet are off.
              </p>
            </div>
            <CheckIcon className="mt-0.5 size-4 shrink-0" />
          </div>
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
    intents?: readonly Intent[];
    /** Additional toolbar controls, before the intent chips. */
    children?: ReactNode;
  }>;
}
