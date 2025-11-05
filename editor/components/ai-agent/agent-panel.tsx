"use client";

import React, { useCallback, useMemo } from "react";
import { useAgentChat } from "@/lib/ai-agent/hooks/use-agent-chat";
import { MessageList } from "./message-list";
import { AgentInput } from "./agent-input";
import { extractSelectionContext, limitContextSize } from "@/lib/ai-agent/context";
import type { editor } from "@/grida-canvas";
import { useEditorState, useCurrentEditor } from "@/grida-canvas-react";
import { cn } from "@/components/lib/utils";

export interface AgentPanelProps {
  editor?: editor.Editor | null;
  className?: string;
}

export function AgentPanel({ editor: editorProp, className }: AgentPanelProps) {
  // Use editor from context if not provided
  const contextEditor = useCurrentEditor();
  const editor = editorProp ?? contextEditor ?? null;
  const [selection, setSelection] = React.useState<string[]>([]);
  const [includeContext, setIncludeContext] = React.useState(false);

  // Subscribe to selection changes using useEditorState
  const editorSelection = useEditorState(editor, (state) => state.selection);

  React.useEffect(() => {
    if (editorSelection) {
      setSelection(Array.from(editorSelection));
    } else {
      setSelection([]);
    }
  }, [editorSelection]);

  // Extract context when needed
  const context = useMemo(() => {
    if (!editor || !includeContext || selection.length === 0) {
      return null;
    }

    const extracted = extractSelectionContext(editor, selection);
    return extracted ? limitContextSize(extracted) : null;
  }, [editor, selection, includeContext]);

  const { messages, isLoading, error, sendMessage, clear } = useAgentChat({
    editor,
  });

  const handleSend = useCallback(
    async (content: string, providedContext?: typeof context | null) => {
      const contextToUse = providedContext ?? context;
      await sendMessage(content, contextToUse);
      setIncludeContext(false); // Reset after sending
    },
    [sendMessage, context]
  );

  const handleIncludeContext = useCallback(() => {
    setIncludeContext((prev) => !prev);
  }, []);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} className="h-full" />
      </div>
      {error && (
        <div className="px-4 py-2 text-sm text-destructive bg-destructive/10 border-t">
          {error}
        </div>
      )}
      <AgentInput
        onSend={handleSend}
        context={includeContext ? context : null}
        onIncludeContext={
          selection.length > 0 ? handleIncludeContext : undefined
        }
        isLoading={isLoading}
        disabled={!editor}
      />
    </div>
  );
}
