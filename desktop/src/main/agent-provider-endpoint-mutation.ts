/** GRIDA-SEC-004 — fail-closed ordering for main-owned endpoint authority. */
export namespace AgentProviderEndpointMutation {
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
