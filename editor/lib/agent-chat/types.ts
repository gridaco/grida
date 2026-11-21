import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";
import type {
  NativeChatActivityOutcome,
  NativeChatCommandAction,
} from "@grida/desktop-bridge";

export type ChatMessage = UIMessage;
export type ToolCallEntry = (ToolUIPart | DynamicToolUIPart) & {
  /** Host-supplied presentation metadata for a shell command. */
  commandActivity?: Readonly<{
    actions: readonly NativeChatCommandAction[];
    outcome: NativeChatActivityOutcome;
  }>;
};
