/**
 * Workspace agent pane — the native agent's chat over the user's workspace.
 *
 * This file only routes: it waits for the workbench route to settle on this
 * workspace and mounts the native chat (`native-agent-pane.tsx`) plus the
 * external-agent panel when Desktop offers one. The chat itself runs in the
 * native agent supervised by Desktop Main.
 */

"use client";

import { useSearchParams } from "next/navigation";
import { cn } from "@app/ui/lib/utils";
import { useDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import type { WorkspaceSurfaceHost } from "./workspace-surface-host";
import { NativeAgentPaneGate } from "./native-agent-pane";
import { NativeExternalAgentPanel } from "./native-external-agent-panel";

export type AgentPaneProps = {
  workspace: Workspace;
  /** Host-owned artifact presentation for this workbench's editor group. */
  surfaceHost: WorkspaceSurfaceHost;
  className?: string;
};

export function AgentPane({
  workspace,
  surfaceHost,
  className,
}: AgentPaneProps) {
  const bridge = useDesktopBridge();
  const params = useSearchParams();
  const initialSession = params.get("session");
  const chat = bridge?.nativeChat;
  // The route can still be resolving the next workspace after navigation.
  const ready = !!chat && params.get("id") === workspace.id;
  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      {ready && bridge?.nativeExternalAgent && (
        <NativeExternalAgentPanel
          key={`local/${workspace.id}`}
          bridge={bridge.nativeExternalAgent}
        />
      )}
      {chat && ready && (
        <NativeAgentPaneGate
          key={workspace.id}
          bridge={chat}
          selectionKey={workspace.id}
          workspaceId={workspace.id}
          initialSession={initialSession}
          editorSurfaces={surfaceHost}
        />
      )}
    </div>
  );
}
