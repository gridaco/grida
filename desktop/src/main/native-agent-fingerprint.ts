/**
 * A native agent fingerprint: a SHA-256 digest the host writes as 64 lowercase
 * hexadecimal characters. Main compares and returns it verbatim.
 */
export namespace NativeAgentFingerprint {
  const HEX = /^[0-9a-f]{64}$/;

  export function is(value: unknown): value is string {
    return typeof value === "string" && HEX.test(value);
  }
}
