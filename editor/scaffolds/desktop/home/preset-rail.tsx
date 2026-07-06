"use client";

import Link from "next/link";
import { SettingsIcon } from "lucide-react";
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
 * `PresetRail` — the home-scoped, icon-only sidebar. Not app chrome: it lives
 * inside the welcome window and does one thing — mutate the active preset (plus
 * a Settings link pinned to the footer).
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
  // Neutral `general` (Home) has no artwork — a plain label tooltip, like
  // Settings. The marketable presets (which carry `art`) get the tutorial-style
  // hover card: 16:9 artwork + name + a one-liner that advertises the mode.
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
          className="w-64 overflow-hidden p-0"
        >
          {/* 16:9 artwork — a swappable static asset (gif/image later). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.art}
            alt=""
            className="aspect-video w-full object-cover"
          />
          <div className="p-2.5">
            <div className="flex items-center gap-1.5">
              <div className="text-xs font-semibold">{p.label}</div>
              {soon && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  Coming soon
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
              {p.description}
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    );
  };

  // Split the rail: the neutral Home base, a divider, then the marketable modes.
  const homeItems = ApplicationPreset.list.filter((p) => !p.art);
  const presetItems = ApplicationPreset.list.filter((p) => p.art);

  return (
    <TooltipProvider>
      <nav
        data-testid="desktop-home-preset-rail"
        aria-label="Mode"
        className={cn(
          "flex w-12 shrink-0 flex-col items-center gap-0.5 border-r bg-background py-2",
          className
        )}
      >
        {homeItems.map(renderItem)}
        {/* Divider — sets the neutral Home apart from the marketable modes. */}
        <div className="my-1 h-px w-6 bg-border" aria-hidden />
        {presetItems.map(renderItem)}

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
