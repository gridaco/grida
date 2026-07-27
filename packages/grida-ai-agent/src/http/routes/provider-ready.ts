/**
 * Post-mutation notification for provider configuration routes.
 *
 * The credential/config mutation is the route's authoritative operation.
 * Queue recovery is follow-up work: it must never turn a successfully stored
 * credential into a failed HTTP response, whether the hook throws
 * synchronously or rejects asynchronously.
 */
export namespace ProviderReady {
  export type Hook = () => void | Promise<void>;

  export function notify(hook: Hook | undefined): void {
    if (!hook) return;
    void Promise.resolve()
      .then(() => hook())
      .catch((err) => {
        console.warn(
          `[grida-agent] provider-ready hook failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      });
  }
}
