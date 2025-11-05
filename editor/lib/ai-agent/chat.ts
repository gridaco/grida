import type { Message, ToolCall, ToolResult } from "./types";

/**
 * Chat state management and message handling
 */

export class ChatManager {
  private messages: Message[] = [];
  private listeners: Set<() => void> = new Set();

  getMessages(): Message[] {
    return [...this.messages];
  }

  getMessage(messageId: string): Message | undefined {
    return this.messages.find((m) => m.id === messageId);
  }

  addMessage(message: Omit<Message, "id" | "timestamp">): Message {
    const newMessage: Message = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    this.messages.push(newMessage);
    this.notifyListeners();
    return newMessage;
  }

  updateMessage(messageId: string, updates: Partial<Message>): void {
    const index = this.messages.findIndex((m) => m.id === messageId);
    if (index !== -1) {
      this.messages[index] = { ...this.messages[index], ...updates };
      this.notifyListeners();
    }
  }

  addToolCall(messageId: string, toolCall: ToolCall): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      if (!message.toolCalls) {
        message.toolCalls = [];
      }
      message.toolCalls.push(toolCall);
      this.notifyListeners();
    }
  }

  addToolResult(messageId: string, toolResult: ToolResult): void {
    const message = this.messages.find((m) => m.id === messageId);
    if (message) {
      if (!message.toolResults) {
        message.toolResults = [];
      }
      message.toolResults.push(toolResult);
      this.notifyListeners();
    }
  }

  clear(): void {
    this.messages = [];
    this.notifyListeners();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}
