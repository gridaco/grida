import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

export type ChatMessage = UIMessage;
export type ToolCallEntry = ToolUIPart | DynamicToolUIPart;
