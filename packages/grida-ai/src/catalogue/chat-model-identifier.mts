/** Selector grammar accepted by Desktop's installed foreground chat transports. */
export function isChatModelIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9_.:@/-]{0,127}$/.test(value)
  );
}
