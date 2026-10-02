import { expect, test, vi } from "vitest";
vi.mock("node:crypto", () => ({
  randomInt: vi.fn<(min: number, max: number) => number>(() => 42),
}));
import { randomInt } from "node:crypto";
import { otp, otp4, otp6 } from "./otp";

test("numeric OTPs use the cryptographic generator and preserve leading zeros", () => {
  expect(otp6()).toBe("000042");
  expect(randomInt).toHaveBeenLastCalledWith(0, 1_000_000);
  expect(otp4()).toBe("0042");
  expect(randomInt).toHaveBeenLastCalledWith(0, 10_000);
});

test("invalid lengths fail before requesting random bytes", () => {
  vi.mocked(randomInt).mockClear();
  for (const length of [0, -1, 1.5, 33, NaN, 16])
    expect(() => otp(length)).toThrow(/otp\(length\):/);
  expect(randomInt).not.toHaveBeenCalled();
});
