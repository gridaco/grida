"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ExternalLinkIcon,
  LogOutIcon,
  SettingsIcon,
  UserRoundIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@app/ui/components/avatar";
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { app, useDesktopBridge } from "@/lib/desktop/bridge";

export function HomeAccountMenu() {
  const router = useRouter();
  const desktop = useDesktopBridge();
  const isMac = desktop?.app.platform === "darwin";
  const [{ name, email }, setProfile] = useState({ name: "", email: "" });
  const label = name || email || "Account";
  const [initial] = name || email;
  const avatar = initial ? (
    initial.toUpperCase()
  ) : (
    <UserRoundIcon className="size-3.5" />
  );

  useEffect(() => {
    const request = new AbortController();
    async function loadProfile() {
      const response = await fetch("/desktop/auth/me", {
        signal: request.signal,
      });
      if (!response.ok) return;
      const { user }: { user: { name?: unknown; email?: unknown } | null } =
        await response.json();
      const name = typeof user?.name === "string" ? user.name.trim() : "";
      const email = typeof user?.email === "string" ? user.email.trim() : "";
      if (!request.signal.aborted) setProfile({ name, email });
    }
    void loadProfile().catch(() => {});
    return () => request.abort();
  }, []);

  function openSettings() {
    if (!desktop?.window.open_settings) {
      router.push("/desktop/settings");
      return;
    }
    void app.openSettings().catch(() => toast.error("Couldn't open Settings."));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="mt-auto rounded-full data-[state=open]:bg-accent"
          aria-label="Account menu"
        >
          <Avatar size="sm" aria-hidden>
            <AvatarFallback className="font-medium">{avatar}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-56"
      >
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <Avatar aria-hidden>
            <AvatarFallback className="font-medium">{avatar}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate" title={label}>
              {label}
            </div>
            {email && email !== label && (
              <div
                className="truncate text-xs font-normal text-muted-foreground"
                title={email}
              >
                {email}
              </div>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={openSettings}
          aria-keyshortcuts={isMac ? "Meta+," : "Control+,"}
        >
          <SettingsIcon />
          Settings
          <DropdownMenuShortcut aria-hidden>
            {isMac ? "⌘," : "Ctrl+,"}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a
            href="https://github.com/gridaco/grida"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLinkIcon />
            GitHub
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/desktop/settings#account" prefetch={false}>
            <LogOutIcon />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
