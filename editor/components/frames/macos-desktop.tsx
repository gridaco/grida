import { cn } from "@/components/lib/utils";
import { Resources } from "@/resources";
import Image from "next/image";
import React from "react";

// ───────────────────────────────────────────────────────────────────────────
// macOS desktop frame — pure visual primitives. Each piece (desktop wallpaper,
// menu bar, dock, window chrome) renders its own look but takes no opinion on
// where it sits. Positioning, sizing, and layout belong to the callsite.
//
// Asset references live in `@/resources` (`Resources.assets.macos.*`).
// ───────────────────────────────────────────────────────────────────────────

export interface MacOSDesktopProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Wallpaper image URL. Defaults to the Tahoe beach wallpaper.
   * Set to `null` for no wallpaper (transparent background).
   */
  wallpaper?: string | null;
}

/**
 * macOS desktop container — paints the wallpaper and establishes a positioning
 * context. Layout (flex / grid / aspect ratio) and where the menu bar, dock,
 * or windows sit are all callsite concerns. Drop any children inside and
 * position them with normal Tailwind utilities.
 */
export function MacOSDesktop({
  wallpaper = Resources.assets.macos.wallpapers.tahoeBeach,
  children,
  className,
  style,
  ...props
}: MacOSDesktopProps) {
  return (
    <div
      className={cn("relative bg-cover bg-center", className)}
      style={{
        ...(wallpaper ? { backgroundImage: `url(${wallpaper})` } : null),
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/** Apple glyph used as the leading mark in the menu bar. */
export function AppleLogo({
  className,
  ...props
}: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 14 17"
      fill="currentColor"
      aria-hidden
      className={className}
      {...props}
    >
      <path d="M11.182 8.97c-.02-2.06 1.683-3.05 1.76-3.099-.96-1.402-2.453-1.595-2.981-1.617-1.27-.128-2.479.748-3.124.748-.645 0-1.638-.728-2.694-.708-1.386.02-2.665.806-3.378 2.046-1.44 2.495-.367 6.184 1.034 8.213.687.99 1.504 2.104 2.578 2.064 1.034-.041 1.426-.668 2.677-.668 1.252 0 1.6.668 2.694.647 1.113-.02 1.817-1.011 2.493-2.007.785-1.149 1.108-2.262 1.128-2.32-.025-.012-2.165-.832-2.187-3.299zM9.265 2.948C9.83 2.263 10.211 1.31 10.107.36 9.296.394 8.314.9 7.73 1.584 7.207 2.19 6.748 3.16 6.87 4.09c.904.07 1.83-.46 2.395-1.142z" />
    </svg>
  );
}

export interface MacOSMenuBarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Bold app name shown after the Apple glyph. */
  appName?: string;
  /** Plain-text menu labels. Defaults to File / Edit / View / Go. */
  menus?: string[];
  /** Right-side slot (clock, status icons). */
  trailing?: React.ReactNode;
}

/**
 * macOS menu bar strip. Renders its own visual look only — the callsite
 * decides where it goes (e.g. `absolute inset-x-0 top-0`).
 */
export function MacOSMenuBar({
  appName,
  menus = ["File", "Edit", "View", "Go"],
  trailing = <span className="tabular-nums">Mon 9:41 AM</span>,
  className,
  children,
  ...props
}: MacOSMenuBarProps) {
  return (
    <div
      className={cn(
        "flex h-6 items-center justify-between bg-black/20 px-4 text-[11px] font-medium text-white/90 backdrop-blur-sm",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-4">
        <AppleLogo className="size-3" />
        {appName ? <span className="font-semibold">{appName}</span> : null}
        {menus.map((label) => (
          <span key={label} className="hidden sm:inline">
            {label}
          </span>
        ))}
        {children}
      </div>
      <div className="flex items-center gap-3">{trailing}</div>
    </div>
  );
}

export interface MacOSDockApp {
  name: string;
  /** Image URL. Pass `Resources.assets.macos.icons.<key>` for built-ins. */
  src: string;
}

export interface MacOSDockProps extends React.HTMLAttributes<HTMLDivElement> {
  apps: MacOSDockApp[];
  /** Tailwind size class for each icon. Defaults to `size-11` (44px). */
  iconClassName?: string;
}

/**
 * macOS dock pill. Renders its own visual look only — the callsite decides
 * where it sits (e.g. `absolute inset-x-0 bottom-4 mx-auto w-fit`).
 */
export function MacOSDock({
  apps,
  iconClassName = "size-11",
  className,
  ...props
}: MacOSDockProps) {
  return (
    <div
      className={cn(
        "inline-flex items-end gap-2 rounded-2xl border border-white/30 bg-white/20 px-3 py-2 shadow-xl backdrop-blur-md",
        className
      )}
      {...props}
    >
      {apps.map((app) => (
        <Image
          key={app.name}
          src={app.src}
          alt={app.name}
          title={app.name}
          width={44}
          height={44}
          draggable={false}
          className={cn(
            "select-none drop-shadow-md transition-transform duration-150 hover:-translate-y-1.5",
            iconClassName
          )}
        />
      ))}
    </div>
  );
}

/**
 * macOS-style window chrome — traffic lights + optional title strip. Sizing
 * and positioning are entirely callsite concerns.
 */
export function MacOSWindow({
  title,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-black/10 bg-white shadow-2xl",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-gradient-to-b from-zinc-100 to-zinc-50 px-3 py-2">
        <span className="size-3 rounded-full bg-[#FF5F57]" />
        <span className="size-3 rounded-full bg-[#FEBC2E]" />
        <span className="size-3 rounded-full bg-[#28C840]" />
        {title ? (
          <span className="ml-3 text-[12px] font-medium text-zinc-700">
            {title}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
