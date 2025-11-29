"use client";

import React, { createContext, useContext, useMemo } from "react";
import type { Chat } from "@ai-sdk/react";
import type { CanvasDesignAgentMessage } from "../agent/server-agent";
import { makeEditorChat } from "../agent/client-chat";
import { useCurrentEditor } from "@/grida-canvas-react";

type AgentChat = Chat<CanvasDesignAgentMessage>;

const AgentChatContext = createContext<AgentChat | null>(null);

export function AgentChatProvider({ children }: { children: React.ReactNode }) {
  const editor = useCurrentEditor();

  const chat = useMemo(() => {
    return makeEditorChat(editor);
  }, [editor]);

  return (
    <AgentChatContext.Provider value={chat}>
      {children}
    </AgentChatContext.Provider>
  );
}

export function useCurrentAgentChat() {
  const chat = useContext(AgentChatContext);
  if (!chat) {
    throw new Error(
      "useCurrentAgentChat must be used within an AgentChatProvider"
    );
  }
  return chat;
}
