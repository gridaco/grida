/**
 * Workspace agent pane — the native agent's chat over the user's workspace.
 *
 * This file only routes: it waits for the workbench route to settle on this
 * workspace and mounts the native chat (`native-agent-pane.tsx`) plus the
 * external-agent panel when Desktop offers one. A message left by the Welcome
 * composer for this workspace is handed to the chat as its first message.
 * The chat itself runs in the native agent supervised by Desktop Main.
 */

"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@app/ui/lib/utils";
import { useDesktopBridge, type Workspace } from "@/lib/desktop/bridge";
import type { WorkspaceSurfaceHost } from "./workspace-surface-host";
import { welcome_message } from "@/lib/desktop/welcome-message";
import {
  NativeAgentPaneGate,
  type NativeFirstMessage,
} from "./native-agent-pane";
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
  // Read per workspace; the chat takes the text only when it sends.
  const workspaceId = workspace.id;
  const firstMessage = useMemo<NativeFirstMessage | undefined>(() => {
    const message = initialSession ? null : welcome_message.peek(workspaceId);
    return message
      ? {
          profileId: message.profileId,
          waiting: () => welcome_message.peek(workspaceId) !== null,
          take: () => welcome_message.take(workspaceId),
        }
      : undefined;
  }, [workspaceId, initialSession]);
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
          firstMessage={firstMessage}
        />
      )}
    </div>
  );
}
