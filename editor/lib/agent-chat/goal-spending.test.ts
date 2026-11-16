import { describe, expect, it } from "vitest";
import { GoalSpending } from "./goal-spending";

describe("GoalSpending", () => {
  it("converts entered dollars exactly without floating-point rounding", () => {
    expect(GoalSpending.fromUsd("1.00")).toBe("1000");
    expect(GoalSpending.fromUsd("0.001")).toBe("1");
    expect(GoalSpending.fromUsd("0.000000000000000000001")).toBe(
      "0.000000000000000001"
    );
    expect(GoalSpending.fromUsd("9007199254740.993")).toBe("9007199254740993");
    expect(GoalSpending.fromUsd(" 0002.1000 ")).toBe("2100");
    expect(GoalSpending.fromUsd(" ")).toBeUndefined();
  });

  it("renders exact charged, held and remaining amounts without hiding small values", () => {
    expect(GoalSpending.usd("0")).toBe("$0.00");
    expect(GoalSpending.usd("1")).toBe("$0.001");
    expect(GoalSpending.usd("1234.5")).toBe("$1.2345");
    expect(GoalSpending.usd("9007199254740993")).toBe("$9007199254740.993");
    expect(GoalSpending.usd("0.000000000000000001")).toBe(
      "$0.000000000000000000001"
    );
  });

  it("refuses negative, ambiguous, over-precision and out-of-contract amounts", () => {
    for (const value of [
      "0",
      "-1",
      "+1",
      "1e2",
      "1,000",
      "NaN",
      ".1",
      "1.",
      "1000000000000000",
      "0.0000000000000000000001",
    ]) {
      expect(() => GoalSpending.fromUsd(value)).toThrow(
        "goal_spending_amount_invalid"
      );
    }
    expect(GoalSpending.validMills("1000000000000000000")).toBe(false);
    expect(GoalSpending.validMills("01")).toBe(false);
  });
});
