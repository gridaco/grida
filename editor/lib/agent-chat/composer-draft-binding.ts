/**
 * Which kept draft a composer's editor holds while its chat's draft key
 * changes.
 *
 * A different key normally means a different chat: the editor clears and
 * restores that chat's draft. A new chat is the exception. It is assigned its
 * id while the send that created it is being confirmed, so its key changes but
 * the draft does not. The editor keeps what it holds, and a send that is then
 * refused leaves the draft in place under the chat's new key.
 */
export class ComposerDraftBinding {
  private heldKey: string | null = null;
  private sendingKey: string | null = null;

  /** The key of the draft the editor holds, once one was restored. */
  get held(): string | null {
    return this.heldKey;
  }

  /**
   * How the editor meets the draft kept under `key`: it already holds it, the
   * draft it holds was renamed to it during a send, or it switches drafts.
   */
  meet(key: string): "held" | "renamed" | "switch" {
    if (this.heldKey === key) return "held";
    if (this.sendingKey !== null && this.sendingKey === this.heldKey) {
      this.sendingKey = key;
      this.heldKey = key;
      return "renamed";
    }
    return "switch";
  }

  /** The editor now shows the draft kept under `key`. */
  restored(key: string): void {
    this.heldKey = key;
  }

  /** A send of the draft under `key` awaits confirmation. */
  send(key: string): void {
    this.sendingKey = key;
  }

  /** The send ended. Returns every key the sent draft may now be kept under. */
  settle(key: string): readonly string[] {
    const keys = new Set([key]);
    if (this.sendingKey !== null) keys.add(this.sendingKey);
    this.sendingKey = null;
    return [...keys];
  }
}
