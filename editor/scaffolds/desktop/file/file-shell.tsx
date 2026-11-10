/**
 * Desktop **file window** — one shell for both single-thing editor surfaces
 * (replaces the former `/desktop/svg` `WorkstationShell` and `/desktop/canvas`
 * `DesktopCanvasShell` windows). The desktop now has exactly two dedicated
 * editor routes: this file window and the workspace workbench.
 *
 * The two surfaces differ only on the two axes the merge contains:
 *   - **how the thing is addressed** — a single file by `docId` (the agent
 *     sidecar's opaque registry) vs a `.canvas` bundle by `workspaceId`
 *     (+ optional `basePath`) over the workspace fs;
 *   - **the editor** — the SVG canvas vs the slides deck.
 * The chrome (title bar + chat-left AI sidebar) is shared.
 *
 * A deck can use native chat scoped to the bundle. A standalone SVG can use
 * its own saved chats and share the selected text with the agent.
 */

"use client";

import { useCallback, useMemo, useState } from "react";
import type { SvgEditor } from "@grida/svg-editor";
import { cn } from "@app/ui/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@app/ui/components/resizable";
import { CurrentArtifactSurfaceHost } from "@/lib/desktop/current-artifact-surface-host";
import { useDesktopBridge } from "@/lib/desktop/bridge";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { AISidebarChat } from "../ai-sidebar/chat";
import { TitleBar } from "../chrome/title-bar";
import { DesktopCanvasBundleShell } from "../canvas/canvas-bundle-shell";
import { WorkspaceChangesProvider } from "../workbench/workspace-changes";
import { NativeAgentPaneGate } from "../workbench/native-agent-pane";
import { CANVAS_PATH } from "../ai-sidebar/agent-fs-binding";
import { useActiveEditorAgentFs } from "./active-editor-agent-fs";
import { DocumentSurfaceHost } from "./document-surface-host";
import { SingleFileSvgSurface, type FileMeta } from "./single-file-svg-surface";

/**
 * Sidebar / surface split — see `WorkstationShell`'s former notes: numeric
 * sizes are px and string values are percentages in react-resizable-panels v4.
 * Default size is a percentage so the layout scales with the window; the
 * sidebar min/max are pixels because chat readability is a pixel concern.
 */
const SIDEBAR_DEFAULT_SIZE = "25%";
const SIDEBAR_MIN_SIZE = "280px";
const SIDEBAR_MAX_SIZE = "560px";
const SURFACE_DEFAULT_SIZE = "75%";

export function DesktopFileShell({
  docId,
  workspaceId,
  basePath = "",
}: {
  /** Single-file mode: the selected document's opaque id. */
  docId?: string;
  /** Bundle (deck) mode: the workspace the `.canvas` is registered as. */
  workspaceId?: string;
  /** Bundle mode: workspace-relative dir of the `.canvas` ("" = it's the root). */
  basePath?: string;
}) {
  const mode: "doc" | "deck" | "empty" = docId
    ? "doc"
    : workspaceId
      ? "deck"
      : "empty";
  const bridge = useDesktopBridge();
  const nativeChat = useMemo(() => {
    const chat = bridge?.nativeChat;
    if (!chat || mode !== "deck" || !basePath) return chat;
    return {
      ...chat,
      profiles: undefined,
      selectProfile: undefined,
      contextLimit: undefined,
      saveContextLimit: undefined,
      submitWithConfigurationReview: undefined,
    };
  }, [bridge, mode, basePath]);

  const { fs, setActiveEditor: bindLegacyEditor } = useActiveEditorAgentFs();
  const [fileSurface] = useState(() => new DocumentSurfaceHost());
  const setActiveEditor = useCallback(
    (editor: SvgEditor | null) => {
      fileSurface.setEditor(editor);
      bindLegacyEditor(editor);
    },
    [fileSurface, bindLegacyEditor]
  );
  const currentSurfacePath =
    mode === "doc"
      ? CANVAS_PATH
      : mode === "deck"
        ? basePath
          ? WorkspaceArtifact.toAgentPath(basePath)
          : "/"
        : null;
  const surfaceHost = useMemo(
    () =>
      currentSurfacePath
        ? new CurrentArtifactSurfaceHost(currentSurfacePath)
        : undefined,
    [currentSurfacePath]
  );
  // The deck auto-persists (no dirty) and has no filename — its title is the
  // bundle dir's basename, falling back to a generic label for a directly-opened
  // `.canvas` (whose workspace name we'd need a bridge call to resolve; the
  // deck's own "Slides" header carries the affordance anyway). A single-file's
  // title arrives later via `onMeta` once the doc loads, so it starts blank.
  // `mode`/`basePath` are fixed per mount (the page keys the shell), so a lazy
  // initializer is enough — no effect needed.
  const [meta, setMeta] = useState<FileMeta>(() =>
    mode === "deck"
      ? {
          title: basePath ? (basePath.split("/").pop() ?? "Slides") : "Slides",
          dirty: false,
        }
      : { title: "", dirty: false }
  );

  if (mode === "empty") {
    return (
      <div className="flex h-svh w-full flex-col bg-background">
        <TitleBar />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Nothing open.
        </div>
      </div>
    );
  }

  const legacyChat =
    mode === "deck" ? (
      <AISidebarChat workspaceId={workspaceId} surfaceHost={surfaceHost} />
    ) : (
      <AISidebarChat fs={fs} surfaceHost={surfaceHost} />
    );
  // See test/desktop-agent-chat-standalone-svg.md and
  // test/desktop-agent-chat-nested-deck.md.
  const fileChatAvailable =
    mode === "doc"
      ? nativeChat?.document
      : basePath
        ? nativeChat?.nestedDeck
        : nativeChat?.deck;
  return (
    <div className="flex h-svh w-full flex-col bg-background">
      <TitleBar>
        <FileTitle meta={meta} />
      </TitleBar>
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Chat-left workstation. The sidebar is the file window's primary
            affordance; the handle is the only width control (no hide toggle). */}
        <ResizablePanel
          defaultSize={SIDEBAR_DEFAULT_SIZE}
          minSize={SIDEBAR_MIN_SIZE}
          maxSize={SIDEBAR_MAX_SIZE}
        >
          <aside className="flex h-full w-full flex-col">
            {nativeChat && fileChatAvailable ? (
              <NativeAgentPaneGate
                bridge={nativeChat}
                selectionKey={
                  mode === "deck" && !basePath ? workspaceId : undefined
                }
                initialSession={null}
                editorSurfaces={
                  mode === "doc" || nativeChat.deckSvgText
                    ? fileSurface
                    : undefined
                }
                legacy={legacyChat}
              />
            ) : (
              legacyChat
            )}
          </aside>
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={SURFACE_DEFAULT_SIZE}>
          <main className="relative h-full w-full">
            {mode === "doc" ? (
              <SingleFileSvgSurface
                docId={docId}
                onActiveEditor={setActiveEditor}
                onMeta={setMeta}
              />
            ) : (
              // The provider lets the deck + slide surfaces react to the agent's
              // on-disk edits (manifest reload + per-slide external-change reload).
              <WorkspaceChangesProvider workspaceId={workspaceId!}>
                {/* Branch on the manifest `editor`: slides deck vs board canvas. */}
                <DesktopCanvasBundleShell
                  workspaceId={workspaceId!}
                  basePath={basePath}
                  slideSurfaceHost={
                    nativeChat?.deckSvgText && fileChatAvailable
                      ? fileSurface
                      : undefined
                  }
                />
              </WorkspaceChangesProvider>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

/**
 * Title-bar label + dirty dot. Plain text stays part of the drag region (macOS
 * convention: grab the title to move the window). The whole label takes the
 * path tooltip so the user learns this view edits the real file on disk.
 */
function FileTitle({ meta }: { meta: FileMeta }) {
  const pathHint = meta.displayPath
    ? meta.dirty
      ? `${meta.displayPath} — Unsaved changes`
      : meta.displayPath
    : undefined;
  return (
    <div
      className="flex min-w-0 items-center gap-2"
      title={pathHint}
      aria-label={pathHint}
    >
      <span
        className={cn(
          "inline-block size-1.5 rounded-full",
          meta.dirty ? "bg-amber-500" : "bg-transparent"
        )}
        aria-hidden
      />
      <span className="truncate font-medium text-foreground">{meta.title}</span>
    </div>
  );
}
