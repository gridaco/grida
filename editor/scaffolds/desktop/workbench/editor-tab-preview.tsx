/**
 * One coordinated preview viewport for the workspace tab rail.
 *
 * Navigation menus use the same useful topology: many triggers feed one
 * positioned viewport. This version stays purpose-built for tabs, so it adds no
 * menu roles, click-to-pin behavior, focus guards, or extra trigger wrappers.
 */
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { Portal as PortalPrimitive } from "radix-ui";
import type { DesktopBrowser } from "@grida/desktop-bridge";
import type { WorkspaceBrowserTabs } from "./workspace-browser-tabs";
import { cn } from "@app/ui/lib/utils";
import { EditorTabPreviewContent } from "./editor-tab-preview-content";
import { TabPreviewController } from "./tab-preview-controller";
import { TabPreviewPosition } from "./tab-preview-position";
import { WorkspaceTabThumbnail } from "./workspace-tab-thumbnail";
import { WorkbenchTab } from "./workbench-tab";
import type { WorkbenchPanel } from "./workbench-panels";

type Placement = {
  tabKey: string;
  left: number;
  top: number;
  transitionFromPrevious: boolean;
};

export function EditorTabPreview({
  controller,
  railRef,
  workspaceId,
  dirtyPaths,
  revision,
  thumbnailCache,
  panels,
  browsers,
  browserEntries,
}: {
  controller: TabPreviewController;
  railRef: RefObject<HTMLDivElement | null>;
  workspaceId: string;
  dirtyPaths: ReadonlySet<string>;
  revision: number;
  thumbnailCache: WorkspaceTabThumbnail.Cache;
  panels: ReadonlyMap<string, WorkbenchPanel>;
  browsers?: WorkspaceBrowserTabs;
  browserEntries?: ReadonlyMap<string, WorkspaceBrowserTabs.Entry>;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!snapshot.open) {
      setPlacement(null);
      return;
    }

    const target = snapshot;
    const rail = railRef.current;
    if (!rail) {
      controller.dismiss();
      return;
    }
    let frame = 0;

    const update = () => {
      frame = 0;
      const content = contentRef.current;
      if (!content || !target.anchor.isConnected) {
        controller.dismiss();
        return;
      }

      const anchor = TabPreviewPosition.visibleAnchor(
        target.anchor.getBoundingClientRect(),
        rail.getBoundingClientRect()
      );
      if (!anchor) {
        controller.dismiss();
        return;
      }

      const next = TabPreviewPosition.place({
        anchor,
        popup: {
          width: content.offsetWidth,
          height: content.offsetHeight,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      });
      setPlacement((previous) => ({
        tabKey: target.tabKey,
        ...next,
        transitionFromPrevious: previous !== null,
      }));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(target.anchor);
    observer?.observe(rail);
    if (contentRef.current) observer?.observe(contentRef.current);

    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [controller, railRef, snapshot]);

  const target = snapshot.open ? WorkbenchTab.parse(snapshot.tabKey) : null;
  const panelPreview =
    target?.kind === "panel" ? panels.get(target.id)?.preview : undefined;
  const browserEntry =
    target?.kind === "browser" ? browserEntries?.get(target.id) : undefined;
  const positioned = snapshot.open && placement?.tabKey === snapshot.tabKey;
  return (
    <PortalPrimitive.Root>
      {snapshot.open &&
        target &&
        (target.kind === "file" || panelPreview || browserEntry) && (
          <div
            ref={contentRef}
            data-slot="workspace-tab-preview"
            aria-hidden
            className={cn(
              "pointer-events-none fixed z-50 origin-top overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 motion-reduce:animate-none",
              placement?.transitionFromPrevious &&
                "transition-[left,top] duration-150 ease-out motion-reduce:transition-none"
            )}
            style={{
              left: placement?.left ?? 0,
              top: placement?.top ?? 0,
              visibility: positioned ? "visible" : "hidden",
            }}
          >
            <div
              key={`${workspaceId}:${snapshot.tabKey}:${target.kind === "file" ? revision : 0}`}
              className="animate-in fade-in-0 duration-150 ease-out motion-reduce:animate-none"
            >
              {target.kind === "file" ? (
                <EditorTabPreviewContent
                  workspaceId={workspaceId}
                  relPath={target.relPath}
                  dirty={dirtyPaths.has(target.relPath)}
                  revision={revision}
                  thumbnailCache={thumbnailCache}
                />
              ) : browserEntry && browsers ? (
                <BrowserTabPreview tabs={browsers} entry={browserEntry} />
              ) : (
                panelPreview
              )}
            </div>
          </div>
        )}
    </PortalPrimitive.Root>
  );
}

/** Mounted only for the shared rail's currently hovered page. */
export function BrowserTabPreview({
  tabs,
  entry,
}: {
  tabs: WorkspaceBrowserTabs;
  entry: WorkspaceBrowserTabs.Entry;
}) {
  const identity = `${entry.page?.id ?? ""}\0${entry.page?.url ?? ""}\0${entry.previewRevision ?? 0}\0${entry.page?.loading ? "loading" : "ready"}`;
  // StrictMode replays effect setup: both subscriptions share the one lazy
  // hover read, while each cleanup still ignores its own late completion.
  const request = useRef<{
    identity: string;
    promise: Promise<DesktopBrowser.Thumbnail | null>;
  } | null>(null);
  const [capture, setCapture] = useState<{
    identity: string;
    image: DesktopBrowser.Thumbnail | null;
  } | null>(null);
  useEffect(() => {
    const read = (request.current ??= {
      identity,
      promise: tabs.thumbnail(entry.id),
    });
    let current = true;
    void read.promise.then((image) => {
      if (current) setCapture({ identity: read.identity, image });
    });
    return () => {
      current = false;
    };
  }, [tabs, entry.id, identity]);
  return (
    <BrowserTabPreviewContent
      title={entry.page?.title || "Browser"}
      url={entry.page?.url ?? entry.url}
      thumbnail={capture?.identity === identity ? capture.image : null}
    />
  );
}

/** Plain, inert presentation of bounded native pixels and page metadata. */
export function BrowserTabPreviewContent({
  title,
  url,
  thumbnail,
}: {
  title: string;
  url: string | null;
  thumbnail: DesktopBrowser.Thumbnail | null;
}) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = thumbnail?.dataUrl !== failedImage ? thumbnail : null;
  const pixels = image ? (
    // eslint-disable-next-line @next/next/no-img-element -- bounded native JPEG data URI, never a remote optimization request
    <img
      src={image.dataUrl}
      width={image.width}
      height={image.height}
      alt=""
      onError={() => setFailedImage(image.dataUrl)}
      className="h-full w-full object-contain"
    />
  ) : null;
  let host = "New tab";
  if (url) {
    try {
      host = new URL(url).host;
    } catch {}
  }
  return (
    <div className="w-64 overflow-hidden">
      {image && (
        <div className="flex aspect-video items-center justify-center overflow-hidden border-b bg-muted/30">
          {pixels}
        </div>
      )}
      <div className="min-w-0 px-3 py-2">
        <p className="truncate text-xs font-medium">{title}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {host}
        </p>
      </div>
    </div>
  );
}
