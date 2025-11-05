export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: Date;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface SelectionContext {
  nodes: SimplifiedNode[];
  summary: string;
}

export interface SimplifiedNode {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  src?: string;
  children?: SimplifiedNode[];
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}
