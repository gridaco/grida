"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import type { NativeChatPermissionMode } from "@grida/desktop-bridge";
import {
  CheckIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldQuestionMarkIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerActionMenu,
  ComposerToolbarChip,
  ComposerToolbarTooltip,
  composerToolbarButtonClassName,
  composerToolbarLabelClassName,
  type ComposerMenuAction,
} from "@/kits/composer";
import {
  ComposerControlSkeleton,
  composerAccessReviewLabel,
} from "./composer-control-skeleton";

const ACCESS_MODES = {
  restricted: {
    label: composerAccessReviewLabel,
    icon: ShieldQuestionMarkIcon,
  },
  approve_for_me: { label: "Auto", icon: ShieldCheckIcon },
  full_access: { label: "Full access", icon: ShieldAlertIcon },
} satisfies Record<
  NativeChatPermissionMode,
  { label: string; icon: typeof ShieldCheckIcon }
>;

/** Composer toolbar presentation; the caller owns actions, intents and state. */
export function AgentComposerTools({
  actions,
  intents = [],
  access,
  children,
}: AgentComposerTools.Props) {
  const [accessOpen, setAccessOpen] = useState(false);
  const mode = access?.mode ?? "restricted";
  const full = mode === "full_access";
  const automatic = mode === "approve_for_me";
  const restricted = mode === "restricted";
  const { label: modeLabel, icon: AccessIcon } = ACCESS_MODES[mode];
  const label = access?.uncertain ? "Access unknown" : modeLabel;
  return (
    <>
      <ComposerActionMenu
        items={actions}
        tooltip="Add files or choose a mode"
      />
      {access?.loading ? (
        <ComposerControlSkeleton kind="access" />
      ) : (
        <Popover
          open={accessOpen}
          onOpenChange={(open) => {
            setAccessOpen(open);
            if (open) access?.onOpen?.();
          }}
        >
          <ComposerToolbarTooltip
            label={
              access?.uncertain ? "Check permissions" : "Change permissions"
            }
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className={cn(
                  composerToolbarButtonClassName,
                  full
                    ? "text-amber-600 hover:text-amber-600"
                    : "text-muted-foreground"
                )}
                aria-label={`Access: ${label}`}
                disabled={access?.busy}
              >
                <AccessIcon className="size-3.5" />
                <span className={composerToolbarLabelClassName}>{label}</span>
              </Button>
            </PopoverTrigger>
          </ComposerToolbarTooltip>
          <PopoverContent
            side="top"
            align="start"
            className="w-80 rounded-xl p-1 text-sm"
          >
            <p className="px-2 pt-1.5 pb-1 text-xs text-muted-foreground">
              {access?.staged
                ? "What can the new chat access?"
                : "Access for new messages"}
            </p>
            <button
              type="button"
              aria-pressed={restricted && !access?.uncertain}
              disabled={!access?.available || access.busy}
              onClick={() => {
                setAccessOpen(false);
                access?.onChange("restricted");
              }}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-default"
            >
              <ACCESS_MODES.restricted.icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p>{ACCESS_MODES.restricted.label}</p>
                <p className="text-xs text-muted-foreground">
                  Reads and edits project files and runs sandboxed commands. You
                  review requests for extra access.
                </p>
              </div>
              {restricted && !access?.uncertain && (
                <CheckIcon className="mt-0.5 size-4 shrink-0" />
              )}
            </button>
            {access?.automaticReview && (
              <button
                type="button"
                aria-pressed={automatic && !access.uncertain}
                disabled={!access.available || access.busy}
                onClick={() => {
                  setAccessOpen(false);
                  access.onChange("approve_for_me");
                }}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:opacity-50"
              >
                <ACCESS_MODES.approve_for_me.icon className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p>{ACCESS_MODES.approve_for_me.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Let the chat’s model decide individual file reads and
                    supported command requests. You decide when it needs help.
                  </p>
                </div>
                {automatic && !access.uncertain && (
                  <CheckIcon className="mt-0.5 size-4 shrink-0" />
                )}
              </button>
            )}
            <button
              type="button"
              aria-pressed={full && !access?.uncertain}
              disabled={
                !access?.available || access.fullAccess === false || access.busy
              }
              onClick={() => {
                setAccessOpen(false);
                access?.onChange("full_access");
              }}
              className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-amber-600 hover:bg-muted disabled:opacity-50"
            >
              <ACCESS_MODES.full_access.icon className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p>{ACCESS_MODES.full_access.label}</p>
                <p className="text-xs">
                  Uses the internet and any file your account can access.
                  Commands run without a sandbox or approval prompts.
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
      )}
      {children}
      {intents.map(({ id, ...intent }) => (
        <ComposerToolbarChip key={id} {...intent} />
      ))}
    </>
  );
}

export namespace AgentComposerTools {
  export type Intent = Readonly<
    ComponentProps<typeof ComposerToolbarChip> & { id: string }
  >;
  export type Props = Readonly<{
    actions: readonly ComposerMenuAction[];
    access?: Readonly<{
      mode: NativeChatPermissionMode;
      automaticReview?: boolean;
      fullAccess?: boolean;
      available: boolean;
      loading?: boolean;
      staged?: boolean;
      uncertain?: boolean;
      onOpen?(): void;
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
