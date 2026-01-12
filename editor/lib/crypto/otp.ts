import { randomInt } from "crypto";

/**
 * Generate a cryptographically-secure numeric OTP of a given length.
 *
 * @example
 * otp(6) -> "042781"
 */
export function otp(length: number = 6): string {
  if (!Number.isInteger(length) || length < 1 || length > 32) {
    throw new Error("otp(length): length must be an integer between 1 and 32");
  }

  const max = 10 ** length;
  if (!Number.isSafeInteger(max)) {
    throw new Error(
      "otp(length): length is too large for safe integer generation"
    );
  }

  const n = randomInt(0, max);
  return n.toString().padStart(length, "0");
}

/**
 * Generate a 4-digit numeric OTP.
 *
 * @example
 * otp4() -> "0193"
 */
export function otp4(): string {
  return otp(4);
}

/**
 * Generate a 6-digit numeric OTP.
 *
 * @example
 * otp6() -> "042781"
 */
export function otp6(): string {
  return otp(6);
}
