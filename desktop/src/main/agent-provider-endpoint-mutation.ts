/** GRIDA-SEC-004 — fail-closed ordering for main-owned endpoint authority. */
export namespace AgentProviderEndpointMutation {
  /**
   * Serializes the complete mutation ceremony for one endpoint id without
   * globally blocking unrelated endpoints. The queue tail always settles, so a
   * failed SET/DELETE cannot poison the next operation for the same id.
   */
  export class Coordinator {
    private readonly tails = new Map<string, Promise<void>>();

    async run<T>(endpointId: string, operation: () => Promise<T>): Promise<T> {
      const previous = this.tails.get(endpointId) ?? Promise.resolve();
      const result = previous.then(operation);
      const tail = result.then(
        () => undefined,
        () => undefined
      );
      this.tails.set(endpointId, tail);
      try {
        return await result;
      } finally {
        if (this.tails.get(endpointId) === tail) {
          this.tails.delete(endpointId);
        }
      }
    }
  }

  export async function remove(input: {
    revokeAuthority: () => Promise<void>;
    deleteConfiguration: () => Promise<void>;
  }): Promise<void> {
    // Authority is the security fact; storage is bookkeeping. If persistence
    // hangs or fails, leave an inert config to retry instead of a live grant
    // whose config appears deleted.
    await input.revokeAuthority();
    await input.deleteConfiguration();
  }
}
