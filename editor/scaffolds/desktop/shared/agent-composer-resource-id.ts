import type { InputResourceRouter } from "@/lib/agent-chat";

/**
 * Resource identity must outlive a particular composer mount because it also
 * becomes part of the scratch filename. Browser UUIDs avoid reusing an id when
 * the composer is unmounted and later recreated in the same chat session.
 */
export namespace AgentComposerResourceId {
  export function create(
    source: InputResourceRouter.BrowserFileSource
  ): string {
    return `${source}-${globalThis.crypto.randomUUID()}`;
  }
}
