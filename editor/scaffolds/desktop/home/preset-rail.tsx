"use client";

import Link from "next/link";
import { SettingsIcon, WrenchIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@app/ui/components/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@app/ui/components/hover-card";
import {
  ApplicationPreset,
  type ApplicationPresetId,
  type ApplicationPresetSpec,
} from "./application-preset";

/**
 * The home-scoped, icon-only sidebar. Its tabs share the Welcome surface.
 * The rail also links to Tools and Settings.
 */
export function PresetRail({
  value,
  onChange,
  className,
}: {
  value: ApplicationPresetId;
  onChange: (id: ApplicationPresetId) => void;
  className?: string;
}) {
  const renderItem = (p: ApplicationPresetSpec) => {
    const Icon = p.icon;
    const active = p.id === value;
    const soon = !!p.comingSoon;
    // Coming-soon modes stay hoverable (so the card/tooltip can explain the
    // status) but are non-actionable: no `onChange`, `aria-disabled`, dimmed —
    // NOT the `disabled` attribute, which would kill the hover that reveals it.
    const button = (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={soon ? undefined : () => onChange(p.id)}
        aria-label={soon ? `${p.label} (coming soon)` : p.label}
        aria-current={active ? "page" : undefined}
        aria-disabled={soon || undefined}
        className={cn(
          "text-muted-foreground",
          active && "bg-accent text-accent-foreground",
          soon &&
            "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground"
        )}
      >
        <Icon className="size-4" />
      </Button>
    );
    if (!p.art) {
      return (
        <Tooltip key={p.id}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">
            {soon ? `${p.label} — coming soon` : p.label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <HoverCard key={p.id} openDelay={120} closeDelay={80}>
        <HoverCardTrigger asChild>{button}</HoverCardTrigger>
        <HoverCardContent
          side="right"
          align="start"
          sideOffset={10}
          className="relative aspect-8/5 w-64 overflow-hidden p-0"
        >
          <picture>
            {p.reducedMotionArt && (
              <source
                media="(prefers-reduced-motion: reduce)"
                srcSet={p.reducedMotionArt}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.art}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
          </picture>
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 bg-linear-to-t via-45% to-transparent px-3 pt-4 pb-2.5",
              p.artTone === "light"
                ? "from-white/35 via-white/15 text-neutral-900 text-shadow-[0_1px_2px_rgb(255_255_255_/_0.5)]"
                : "from-black/35 via-black/15 text-white text-shadow-[0_1px_3px_rgb(0_0_0_/_0.8)]"
            )}
          >
            <div className="flex items-center gap-1.5">
              <div className="text-xs font-semibold">{p.label}</div>
              {soon && (
                <span className="rounded-full bg-current/15 px-1.5 text-[10px] leading-4 font-medium">
                  Coming soon
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-4 opacity-90">
              {p.description}
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  const homeItem = ApplicationPreset.byId(ApplicationPreset.DEFAULT);
  const presetItems = ApplicationPreset.list.filter(
    (p) => p.id !== homeItem.id
  );

  return (
    <TooltipProvider>
      <nav
        data-testid="desktop-home-preset-rail"
        aria-label="Welcome navigation"
        className={cn(
          "flex w-12 shrink-0 flex-col items-center gap-0.5 border-r bg-background py-2",
          className
        )}
      >
        {renderItem(homeItem)}
        {/* Divider — sets the neutral Home apart from the marketable modes. */}
        <div className="my-1 h-px w-6 bg-border" aria-hidden />
        {presetItems.map(renderItem)}

        {/* Tools is a destination, not an application preset: it owns a unique,
            temporary surface instead of mutating the Welcome composer. */}
        <div className="my-1 h-px w-6 bg-border" aria-hidden />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
            >
              <Link href="/desktop/tools" prefetch={false} aria-label="Tools">
                <WrenchIcon className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Tools</TooltipContent>
        </Tooltip>

        {/* Footer — pinned to the bottom of the rail. Settings used to live in
            the title bar; the rail gives it a natural home now. */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              asChild
              variant="ghost"
              size="icon-sm"
              className="mt-auto text-muted-foreground"
            >
              <Link
                href="/desktop/settings"
                prefetch={false}
                aria-label="Settings"
              >
                <SettingsIcon className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </nav>
    </TooltipProvider>
  );
}
