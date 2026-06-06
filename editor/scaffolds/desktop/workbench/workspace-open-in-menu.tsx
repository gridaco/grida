"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BoxIcon,
  ChevronDownIcon,
  ClipboardIcon,
  Code2Icon,
  FolderOpenIcon,
  HammerIcon,
  TerminalIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { ButtonGroup } from "@app/ui/components/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { TITLEBAR_NO_DRAG_STYLE } from "@/scaffolds/desktop/chrome/title-bar";
import { copyWorkspacePath } from "./workbench-file-actions";

const STORAGE_KEY = "grida.desktop.workspace.openIn.preferredApp";
const DEFAULT_WORKSPACE_APP: HostAppId = "finder";

const PREFERRED_WORKSPACE_APPS: HostAppId[] = [
  "finder",
  "vscode",
  "cursor",
  "sublime",
  "terminal",
  "warp",
  "xcode",
];

export function WorkspaceOpenInMenu({ workspace }: { workspace: Workspace }) {
  const [apps, setApps] = useState<HostAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<HostAppId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preferredAppId, setPreferredAppId] = useState<HostAppId | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isHostAppId(stored)) setPreferredAppId(stored);
  }, []);

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

  const selectedApp =
    installedApps.find((app) => app.id === preferredAppId) ??
    installedApps.find((app) => app.id === DEFAULT_WORKSPACE_APP) ??
    installedApps[0] ??
    null;

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

  function preferAndOpen(appId: HostAppId) {
    setPreferredAppId(appId);
    window.localStorage.setItem(STORAGE_KEY, appId);
    void openIn(appId);
  }

  return (
    <ButtonGroup
      className="rounded-md border bg-background shadow-xs"
      style={TITLEBAR_NO_DRAG_STYLE}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!selectedApp || opening !== null}
        onClick={() => selectedApp && void openIn(selectedApp.id)}
        aria-label={
          selectedApp
            ? `Open workspace in ${selectedApp.label}`
            : "Open workspace in app"
        }
        title={
          selectedApp
            ? `Open workspace in ${selectedApp.label}`
            : (error ?? "Open workspace in app")
        }
      >
        {selectedApp ? <HostAppIcon app={selectedApp} /> : <Code2Icon />}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="w-5 px-0"
            aria-label="Choose app"
            title="Choose app"
          >
            <ChevronDownIcon className="size-2.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
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
                  onSelect={() => preferAndOpen(app.id)}
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
    </ButtonGroup>
  );
}

function isHostAppId(id: string | null): id is HostAppId {
  return (
    typeof id === "string" &&
    (PREFERRED_WORKSPACE_APPS as readonly string[]).includes(id)
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
