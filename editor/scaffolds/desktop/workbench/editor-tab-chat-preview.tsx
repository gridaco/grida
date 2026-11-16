"use client";

import { useSyncExternalStore } from "react";
import { MessageSquareTextIcon } from "lucide-react";
import { Message, MessageContent } from "@app/ui/ai-elements/message";
import { ChatTabPreview } from "./chat-tab-preview";

/** Subscribes to an existing chat only while its hover preview is mounted. */
export function EditorTabChatPreview({
  title,
  source,
}: {
  title: string;
  source: ChatTabPreview.Source;
}) {
  const state = useSyncExternalStore(
    source.subscribe,
    source.read,
    source.read
  );
  return <ChatTabPreviewContent title={title} messages={state.messages} />;
}

export function ChatTabPreviewContent({
  title,
  messages,
}: {
  title: string;
  messages: readonly ChatTabPreview.Message[];
}) {
  const excerpts = ChatTabPreview.latest(messages);
  return (
    <div data-testid="chat-tab-preview" className="w-72 overflow-hidden">
      <div className="flex items-center gap-2 border-b px-3 py-2.5">
        <MessageSquareTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="min-w-0 truncate text-xs font-medium">{title}</p>
      </div>
      <div className="space-y-3 px-3 py-3">
        {excerpts.length ? (
          excerpts.map((excerpt) => (
            <Message
              key={excerpt.role}
              from={excerpt.role}
              role="group"
              aria-label={excerpt.role === "user" ? "You" : "Grida"}
              className={excerpt.role === "user" ? "gap-1" : "max-w-full gap-1"}
            >
              <MessageContent className="text-xs leading-relaxed group-[.is-user]:px-2.5 group-[.is-user]:py-2">
                <p className="line-clamp-3 break-words [overflow-wrap:anywhere]">
                  {excerpt.text}
                </p>
              </MessageContent>
            </Message>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No messages yet</p>
        )}
      </div>
    </div>
  );
}
