/** Secret-free connection state for ElevenLabs BYOK audio. */
export namespace ElevenLabsConnection {
  export type State =
    | Readonly<{ kind: "loading" }>
    | Readonly<{ kind: "connected" }>
    | Readonly<{ kind: "missing" }>
    | Readonly<{ kind: "error" }>;

  export type PresenceProbe = () => Promise<boolean>;

  export const initial: State = Object.freeze({ kind: "loading" });

  /**
   * Map the renderer-safe provider-key presence probe onto UI connection state.
   * Probe failures remain distinct from a confirmed missing key so a transient
   * bridge failure cannot hide an otherwise callable generation surface.
   */
  export async function probe(hasKey: PresenceProbe): Promise<State> {
    try {
      return Object.freeze({
        kind: (await hasKey()) ? "connected" : "missing",
      });
    } catch {
      return Object.freeze({ kind: "error" });
    }
  }
}
