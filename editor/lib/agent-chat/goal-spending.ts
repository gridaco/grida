/** Exact display/input conversion. Provider authority and settlement stay native. */
export namespace GoalSpending {
  export function fromUsd(value: string): string | undefined {
    const text = value.trim();
    if (!text) return undefined;
    if (text.length > 64 || !/^\d+(?:\.\d{1,21})?$/.test(text)) throw invalid();
    const [whole, fraction = ""] = text.split(".");
    const digits = (whole + fraction.padEnd(3, "0")).replace(/^0+(?=\d)/, "");
    const scale = Math.max(0, fraction.length - 3);
    const result = decimal(digits, scale);
    if (!validMills(result, true)) throw invalid();
    return result;
  }

  export function usd(value: string): string {
    if (!validMills(value)) throw invalid();
    const [whole, fraction = ""] = value.split(".");
    const result = decimal(whole + fraction, fraction.length + 3);
    const [integer, remainder = ""] = result.split(".");
    return `$${integer}.${remainder.padEnd(2, "0")}`;
  }

  export function validMills(
    value: unknown,
    positive = false
  ): value is string {
    return (
      typeof value === "string" &&
      value.length <= 64 &&
      /^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value) &&
      (!positive || /[1-9]/.test(value))
    );
  }

  function decimal(value: string, scale: number): string {
    const digits = value.padStart(scale + 1, "0");
    const whole = (scale ? digits.slice(0, -scale) : digits).replace(
      /^0+(?=\d)/,
      ""
    );
    const fraction = scale ? digits.slice(-scale).replace(/0+$/, "") : "";
    return fraction ? `${whole}.${fraction}` : whole;
  }
  function invalid(): Error {
    return new Error("goal_spending_amount_invalid");
  }
}
