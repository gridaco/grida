import type { InputResourceRouter } from "./input-resource-router";

export type PreparedResourceSelection =
  | {
      status: "ready";
      resources: InputResourceRouter.BoundResource[];
    }
  | { status: "missing"; attachmentIds: string[] };

/**
 * Binds generic composer card ids to the typed resources prepared for them.
 *
 * The composer intentionally owns display state only. This ledger gives its
 * agent-facing owner an explicit, testable identity seam for dedupe, removal,
 * clearing, and ordered submit selection without leaking bytes into card
 * payloads or reclassifying cards later.
 */
export class PreparedResourceLedger {
  private readonly resources = new Map<
    string,
    InputResourceRouter.PreparedResource
  >();

  hasDedupeKey(dedupeKey: string): boolean {
    return [...this.resources.values()].some(
      (resource) => resource.dedupeKey === dedupeKey
    );
  }

  bind(
    attachmentId: string,
    resource: InputResourceRouter.PreparedResource
  ): void {
    this.resources.set(attachmentId, resource);
  }

  remove(attachmentId: string): void {
    this.resources.delete(attachmentId);
  }

  clear(): void {
    this.resources.clear();
  }

  all(): InputResourceRouter.PreparedResource[] {
    return [...this.resources.values()];
  }

  reconcile(liveAttachmentIds: readonly string[]): void {
    const live = new Set(liveAttachmentIds);
    for (const id of this.resources.keys()) {
      if (!live.has(id)) this.resources.delete(id);
    }
  }

  select(attachmentIds: readonly string[]): PreparedResourceSelection {
    const resources: InputResourceRouter.BoundResource[] = [];
    const missing: string[] = [];
    for (const attachmentId of attachmentIds) {
      const resource = this.resources.get(attachmentId);
      if (resource) resources.push({ attachmentId, resource });
      else missing.push(attachmentId);
    }
    return missing.length > 0
      ? { status: "missing", attachmentIds: missing }
      : { status: "ready", resources };
  }
}
