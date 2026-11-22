/**
 * Which kept draft a composer's editor holds while its chat's draft key
 * changes.
 *
 * When a new chat gets its id, the controller supplies the key the draft
 * moved from. The editor can keep its document if that move kept the same
 * content.
 */
export class ComposerDraftBinding {
  private heldKey: string | null = null;

  /** The key of the draft the editor holds, once one was restored. */
  get held(): string | null {
    return this.heldKey;
  }

  /**
   * How the editor meets the draft kept under `key`: it already holds it, the
   * draft it holds was promoted to it as a new chat, or it switches drafts.
   */
  meet(key: string, promotedFrom?: string): "held" | "promoted" | "switch" {
    if (this.heldKey === key) return "held";
    return this.heldKey === promotedFrom ? "promoted" : "switch";
  }

  /** The editor now shows the draft kept under `key`. */
  restored(key: string): void {
    this.heldKey = key;
  }
}
