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
import type { SideChatPlacement } from "./side-chat-placement";
import type { SubagentPlacement } from "./subagent-placement";
import { welcome_message } from "@/lib/desktop/welcome-message";
import {
  NativeAgentPaneGate,
  type NativeFirstMessage,
} from "./native-agent-pane";
import { NativeExternalAgentPanel } from "./native-external-agent-panel";
import type { NativeBackgroundProcessController } from "@/lib/agent-chat/native-background-process-controller";

export type AgentPaneProps = {
  workspace: Workspace;
  /** Host-owned artifact presentation for this workbench's editor group. */
  surfaceHost: WorkspaceSurfaceHost;
  /** Where the chat's side chat is shown in this workbench. */
  sideChatPlacement: SideChatPlacement;
  subagentPlacement?: SubagentPlacement;
  onProcessesChange?: (
    processes: NativeBackgroundProcessController | null
  ) => void;
  className?: string;
};

export function AgentPane({
  workspace,
  surfaceHost,
  sideChatPlacement,
  subagentPlacement,
  onProcessesChange,
  className,
}: AgentPaneProps) {
  const bridge = useDesktopBridge();
  const params = useSearchParams();
  const initialSession = params.get("session");
  const chat = bridge?.nativeChat;
  // Read per workspace; the chat takes the complete request when it sends.
  const workspaceId = workspace.id;
  const firstMessage = useMemo<NativeFirstMessage | undefined>(() => {
    const pending = initialSession
      ? null
      : welcome_message.pending(workspaceId);
    if (!pending) return;
    const { message, waiting, peek, take } = pending;
    return {
      profileId: message.profileId,
      composer: message,
      waiting,
      peek,
      take,
      transferNextDraft: message.transferNextDraft,
    };
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
      {bridge && !chat && (
        // An installed Desktop older than the native agent has no chat
        // bridge; say so instead of leaving the pane empty.
        <p
          data-testid="workspace-agent-update-required"
          className="m-3 text-sm text-muted-foreground"
        >
          Update Grida Desktop to use the agent.{" "}
          <a
            href="https://grida.co/downloads"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Download the latest version
          </a>
        </p>
      )}
      {chat && ready && (
        <NativeAgentPaneGate
          key={workspace.id}
          bridge={chat}
          selectionKey={workspace.id}
          workspaceId={workspace.id}
          workingDirectory={workspace.root}
          initialSession={initialSession}
          editorSurfaces={surfaceHost}
          sideChatPlacement={sideChatPlacement}
          subagentPlacement={subagentPlacement}
          firstMessage={firstMessage}
          onProcessesChange={onProcessesChange}
        />
      )}
    </div>
  );
}
