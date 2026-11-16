"use client";

import type { NativeChatMessage } from "@grida/desktop-bridge";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@app/ui/ai-elements/conversation";
import {
  ChatMessageView,
  CompactionNotice,
  PendingTurnIndicator,
} from "@/kits/agent-chat";
import { native_message_parts } from "@/lib/agent-chat/native-message-parts";
import { turn_activity } from "@/lib/agent-chat/turn-activity";
import { NativeTurnActivity } from "@/scaffolds/desktop/workbench/native-turn-activity";
import styles from "@/scaffolds/desktop/workbench/agent-pane.module.css";
import { DesktopConversationFixtures as fixtures } from "./desktop-conversation-fixtures";

/** The Desktop transcript components with local, read-only example messages. */
export function DesktopConversation({
  scenario,
  messages,
  running,
}: {
  scenario: fixtures.Scenario;
  messages: readonly NativeChatMessage[];
  running: boolean;
}) {
  const example = fixtures.get(scenario);
  const blocks = turn_activity.group(messages, example.records ?? [], null);
  const renderMessage = (message: NativeChatMessage) => {
    const isStreaming =
      running &&
      message === messages.at(-1) &&
      message.messageId === example.streamingMessageId;
    return (
      <ChatMessageView
        key={message.messageId}
        message={{
          id: message.messageId,
          role: message.role,
          parts: native_message_parts.of(message),
        }}
        isStreaming={isStreaming}
        actions={{
          sentAtMs: fixtures.startedAtMs + messages.indexOf(message) * 30_000,
        }}
        loadAttachmentPreview={fixtures.readImage}
      />
    );
  };
  return (
    <Conversation
      data-testid="desktop-conversation-preview"
      aria-label="Conversation preview"
      className="min-h-0 flex-1"
      initial="instant"
      resize={running ? "smooth" : "instant"}
    >
      <ConversationContent
        className="gap-4 px-3 py-4"
        scrollClassName={`${styles.chatScroll} desktop-native-drag-scroll-viewport scroll-fade-y scroll-fade-4`}
      >
        {messages.length === 0 ? (
          <ConversationEmptyState
            title="No messages yet"
            description="Turn off Running turn and send a message to try the conversation."
          />
        ) : (
          blocks.map((block) =>
            block.kind === "turn" ? (
              <NativeTurnActivity
                key={block.turnId}
                block={block}
                renderMessage={renderMessage}
              />
            ) : block.kind === "compaction" ? (
              <CompactionNotice
                key={block.turnId}
                summary={block.summary}
                auto={block.automatic}
              />
            ) : (
              renderMessage(block.message)
            )
          )
        )}
        {running && messages.length > 0 && messages.at(-1)?.role === "user" && (
          <PendingTurnIndicator />
        )}
      </ConversationContent>
      <ConversationScrollButton aria-label="Scroll to latest message" />
    </Conversation>
  );
}
