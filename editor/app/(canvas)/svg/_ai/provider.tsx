"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSvgEditor } from "@grida/svg-editor/react";
import { AgentVFS } from "./agent-vfs";
import { makeSvgEditorChat, type SvgEditorChat } from "./client-chat";

const SvgEditorChatContext = createContext<SvgEditorChat | null>(null);

export function AISvgChatProvider({ children }: { children: ReactNode }) {
  const editor = useSvgEditor();
  const chat = useMemo(() => makeSvgEditorChat(new AgentVFS(editor)), [editor]);
  return (
    <SvgEditorChatContext.Provider value={chat}>
      {children}
    </SvgEditorChatContext.Provider>
  );
}

export function useSvgAgentChat(): SvgEditorChat {
  const chat = useContext(SvgEditorChatContext);
  if (chat === null) {
    throw new Error("useSvgAgentChat must be used inside <AISvgChatProvider>.");
  }
  return chat;
}
