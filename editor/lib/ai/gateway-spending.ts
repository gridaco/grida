// GRIDA-SEC-006 / GRIDA-GG: gateway — exact execution ceilings, never estimates.

/** Validates the Gateway's USD-mills authorization syntax without repricing work. */
export namespace GatewaySpending {
  export function amount(value: unknown): value is string {
    return (
      typeof value === "string" &&
      /^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,18})?$/.test(value)
    );
  }
}
