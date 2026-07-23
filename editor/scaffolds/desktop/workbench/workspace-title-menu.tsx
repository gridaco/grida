"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BoxIcon,
  ChevronDownIcon,
  ClipboardIcon,
  Code2Icon,
  FolderIcon,
  FolderOpenIcon,
  HammerIcon,
  TerminalIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import {
  hostApps,
  type HostAppId,
  type HostAppInfo,
  type Workspace,
} from "@/lib/desktop/bridge";
import { Resources } from "@/resources";
import { copyWorkspacePath } from "./workbench-file-actions";

const PREFERRED_WORKSPACE_APPS: HostAppId[] = [
  "finder",
  "vscode",
  "cursor",
  "sublime",
  "terminal",
  "warp",
  "xcode",
];

export function WorkspaceTitleMenu({ workspace }: { workspace: Workspace }) {
  const [apps, setApps] = useState<HostAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<HostAppId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    hostApps
      .resolvePreferred({
        workspaceId: workspace.id,
        preferredApps: PREFERRED_WORKSPACE_APPS,
      })
      .then((resolved) => {
        if (cancelled) return;
        setApps(resolved);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Couldn't load apps.");
        setApps([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace.id]);

  const installedApps = useMemo(
    () =>
      apps.filter((app) => app.installed && app.supports.includes("workspace")),
    [apps]
  );

  async function openIn(appId: HostAppId) {
    setOpening(appId);
    setError(null);
    try {
      await hostApps.openWorkspace({ workspaceId: workspace.id, appId: appId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open app.");
    } finally {
      setOpening(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="desktop-no-drag -ml-2 min-w-0 max-w-full gap-1.5 px-2 font-medium"
          aria-label={`${workspace.name} workspace menu`}
        >
          <FolderIcon className="size-3.5 shrink-0" />
          <span className="truncate">{workspace.name}</span>
          <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        <DropdownMenuLabel>Open in</DropdownMenuLabel>
        {loading ? (
          <DropdownMenuItem disabled>Checking apps…</DropdownMenuItem>
        ) : installedApps.length === 0 ? (
          <DropdownMenuItem disabled>
            {error ?? "No preferred apps found"}
          </DropdownMenuItem>
        ) : (
          installedApps.map((app) => {
            return (
              <DropdownMenuItem
                key={app.id}
                disabled={opening !== null}
                onSelect={() => void openIn(app.id)}
              >
                <HostAppIcon app={app} />
                <span>{app.label}</span>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void copyWorkspacePath(workspace)}>
          <ClipboardIcon />
          <span>Copy path</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function HostAppIcon({ app }: { app: HostAppInfo }) {
  const src = macosIconSrc(app);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="size-4 shrink-0 rounded-[3px] object-contain"
        draggable={false}
      />
    );
  }
  const Icon = iconForApp(app.id);
  return <Icon className="size-3.5" />;
}

function macosIconSrc(app: HostAppInfo): string | null {
  const icons = Resources.assets.macos.icons;
  switch (app.id) {
    case "vscode":
      return icons.vscode;
    case "finder":
      return app.label === "Finder" ? icons.finder : null;
    case "xcode":
      return icons.xcode;
    case "cursor":
      return icons.cursor;
    case "sublime":
      return icons.sublime;
    case "terminal":
      return icons.terminal;
    case "warp":
      return icons.warp;
  }
  return null;
}

function iconForApp(appId: HostAppId) {
  switch (appId) {
    case "finder":
      return FolderOpenIcon;
    case "terminal":
    case "warp":
      return TerminalIcon;
    case "xcode":
      return HammerIcon;
    case "cursor":
      return BoxIcon;
    case "vscode":
    case "sublime":
      return Code2Icon;
    default:
      return Code2Icon;
  }
}
