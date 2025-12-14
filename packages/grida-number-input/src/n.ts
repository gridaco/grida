namespace n {
  export type NumberType = "integer" | "number";

  /**
   * Applies precision by limiting to maximum decimal places.
   * This is about LIMITING precision, not rounding to nearest values.
   *
   * @param value - The number to apply precision to
   * @param precision - Maximum decimal places that can be displayed (default: 1)
   * @returns Number with precision applied and artifacts cleaned
   *
   * @example
   * applyPrecision(123.456, 1) → 123.5  // 3 decimals → 1 decimal (rounded)
   * applyPrecision(123.4, 1)   → 123.4  // already ≤1 decimal (preserved)
   * applyPrecision(123.0, 1)   → 123    // trailing zeros removed
   * applyPrecision(123, 1)     → 123    // integers always preserved
   */
  export function applyPrecision(value: number, precision: number = 1): number {
    // Handle special values
    if (!isFinite(value) || value === 0) return value;

    // Clean floating point artifacts first
    const cleaned = cleanFloatingPointArtifacts(value);

    // If precision is 0, round to nearest integer
    if (precision === 0) {
      return Math.round(cleaned);
    }

    // Count decimal places in the cleaned number
    const decimalPlaces = countDecimalPlaces(cleaned);

    // If already within precision limit, return cleaned value
    if (decimalPlaces <= precision) {
      return cleaned;
    }

    // Round to the specified precision
    const multiplier = Math.pow(10, precision);
    const rounded = Math.round(cleaned * multiplier) / multiplier;

    // Clean again and return
    return cleanFloatingPointArtifacts(rounded);
  }

  /**
   * Rounds a number based on the input type and step precision.
   *
   * @param value - The number to round
   * @param step - The step value to match precision with
   * @param type - The input type ('integer' or 'number')
   * @param precision - Maximum precision tolerance (default: 1)
   * @returns The rounded number based on type and step precision
   */
  export function roundToStep(
    value: number,
    step: number,
    type: NumberType,
    precision: number = 1
  ): number {
    let result: number;

    switch (type) {
      case "integer":
        // Always round to whole numbers for integer type
        result = Math.round(value);
        break;

      case "number":
        // For number type, preserve natural precision when step allows it
        const stepDecimals = countDecimalPlaces(step);
        if (stepDecimals === 0) {
          result = value; // For integer steps, preserve the original value
        } else {
          // Round to the same number of decimal places as step
          const multiplier = Math.pow(10, stepDecimals);
          result = Math.round(value * multiplier) / multiplier;
        }
        break;

      default:
        // Fallback to preserve value for unknown types
        result = value;
    }

    // Apply precision tolerance to prevent floating point issues
    // But don't override step precision - use the higher of step precision or tolerance
    const stepPrecision = countDecimalPlaces(step);
    const effectivePrecision = Math.max(stepPrecision, precision);
    return applyPrecision(result, effectivePrecision);
  }

  /**
   * Formats a number with precision based on input type and step value.
   *
   * @param value - The number to format
   * @param step - The step value to determine precision
   * @param type - The input type ('integer' or 'number')
   * @param precision - Maximum precision tolerance (default: 1)
   * @returns Formatted string with appropriate precision
   */
  export function formatValueWithPrecision(
    value: number,
    step: number,
    type: NumberType,
    precision: number = 1
  ): string {
    // IMPORTANT:
    // `precision` is a display/rounding clamp, but it must NEVER reduce precision
    // below what `step` requires. Otherwise values like 0.25 with step=0.01 would
    // be rounded to 0.3 before formatting, which is incorrect for step-based UIs.
    const stepDecimals = countDecimalPlaces(step);
    const effectivePrecision = Math.max(stepDecimals, precision);
    const precisionValue = applyPrecision(value, effectivePrecision);

    switch (type) {
      case "integer":
        // Always format as whole numbers for integer type
        return Math.round(precisionValue).toString();

      case "number":
        // For number type, preserve natural precision when step allows it
        if (stepDecimals === 0) {
          // For integer steps, preserve the decimal places if they exist naturally
          return precisionValue.toString();
        }
        // Format with step precision
        const formatted = precisionValue.toFixed(stepDecimals);
        // Remove trailing zeros after decimal point
        return formatted.replace(/\.?0+$/, "");

      default:
        // Fallback to string representation for unknown types
        return precisionValue.toString();
    }
  }

  /**
   * Counts the number of decimal places in a number.
   *
   * @param value - The number to count decimal places for
   * @returns Number of decimal places
   *
   * @example
   * countDecimalPlaces(1.23) → 2
   * countDecimalPlaces(1.0) → 1
   * countDecimalPlaces(1) → 0
   * countDecimalPlaces(0.123) → 3
   */
  function countDecimalPlaces(value: number): number {
    if (!isFinite(value) || Number.isInteger(value)) return 0;

    const str = value.toString();
    if (str.includes("e")) {
      // Handle scientific notation
      const match = str.match(/e([+-]?\d+)$/);
      if (match) {
        const exponent = parseInt(match[1]);
        const mantissa = str.split("e")[0];
        const mantissaDecimals = mantissa.includes(".")
          ? mantissa.split(".")[1].length
          : 0;
        return Math.max(0, mantissaDecimals - exponent);
      }
    }

    // Handle regular decimal notation
    const decimalIndex = str.indexOf(".");
    return decimalIndex === -1 ? 0 : str.length - decimalIndex - 1;
  }

  /**
   * Cleans common floating-point precision artifacts and trailing zeros.
   *
   * @param value - The number to clean
   * @returns Cleaned number with artifacts and trailing zeros removed
   *
   * @example
   * cleanFloatingPointArtifacts(0.7000000000000001) → 0.7
   * cleanFloatingPointArtifacts(0.30000000000000004) → 0.3
   * cleanFloatingPointArtifacts(5.0) → 5
   * cleanFloatingPointArtifacts(1.0000000000000002) → 1
   */
  function cleanFloatingPointArtifacts(value: number): number {
    if (!isFinite(value) || value === 0) return value;

    // Handle very small floating point artifacts
    // Round to 15 decimal places to eliminate most precision errors
    const rounded = Math.round(value * 1e15) / 1e15;

    // If the difference is negligible, use the rounded value
    if (Math.abs(value - rounded) < Math.abs(value) * 1e-12) {
      return rounded;
    }

    return value;
  }

  /**
   * Parses a string value into a number, handling optional suffix removal.
   * Returns NaN for empty or invalid values instead of 0 to prevent unwanted commits.
   *
   * @param value - The string value to parse
   * @param type - Whether to parse as integer or number
   * @param suffix - Optional suffix to remove (e.g., "%", "px")
   * @returns Parsed number or NaN if invalid/empty
   *
   * @example
   * parseValueWithSuffix("123%", "number", "%") // Returns 123
   * parseValueWithSuffix("", "number")          // Returns NaN
   * parseValueWithSuffix("abc", "number")       // Returns NaN
   */
  export function parseValueWithSuffix(
    value: string,
    type: "integer" | "number",
    suffix?: string
  ): number {
    if (!value) return NaN;

    // Remove suffix if present
    let cleanValue = value;
    if (suffix && value.endsWith(suffix)) {
      cleanValue = value.slice(0, -suffix.length);
    }

    // Parse the numeric value
    const parsed =
      type === "integer" ? parseInt(cleanValue) : parseFloat(cleanValue);

    return isNaN(parsed) ? NaN : parsed;
  }

  /**
   * Formats a value for display with optional suffix, scaling, and precision.
   *
   * @param value - The value to format (number, string, or "mixed")
   * @param suffix - Optional suffix to append (e.g., "%", "px")
   * @param scale - Optional scale factor for display (e.g., 100 for percentages)
   * @param step - Optional step value to determine precision
   * @param type - The input type ('integer' or 'number')
   * @param precision - Maximum precision tolerance (default: 1)
   * @returns Formatted string for display
   *
   * @example
   * formatValueWithSuffix(0.5, "%", 100, 0.1, 'number') // Returns "50%"
   * formatValueWithSuffix("mixed")                      // Returns "mixed"
   * formatValueWithSuffix("")                           // Returns ""
   */
  export function formatValueWithSuffix(
    value: string | number,
    suffix?: string,
    scale?: number,
    step?: number,
    type: "integer" | "number" = "number",
    precision: number = 1
  ): string {
    if (value === "mixed") return "mixed";
    if (value === "") return "";

    let numericValue =
      typeof value === "number" ? value : parseFloat(String(value));

    // Apply scaling if provided (e.g., for percentages: 0.01 -> 1)
    if (scale && typeof numericValue === "number") {
      numericValue = numericValue * scale;
    }

    // Format with proper precision based on step and type
    const formattedValue = step
      ? formatValueWithPrecision(numericValue, step, type, precision)
      : String(applyPrecision(numericValue, precision));

    return suffix ? `${formattedValue}${suffix}` : formattedValue;
  }

  /**
   * Parses a string value into a number with optional suffix removal and inverse scaling.
   *
   * @param value - The string value to parse
   * @param type - Whether to parse as integer or number
   * @param suffix - Optional suffix to remove (e.g., "%", "px")
   * @param scale - Optional scale factor for inverse scaling (e.g., 100 for percentages)
   * @returns Parsed number with inverse scaling applied, or NaN if invalid
   *
   * @example
   * parseValueWithScaling("50%", "number", "%", 100) // Returns 0.5
   * parseValueWithScaling("123", "number", undefined, 100) // Returns 1.23
   */
  export function parseValueWithScaling(
    value: string,
    type: "integer" | "number",
    suffix?: string,
    scale?: number
  ): number {
    const parsedValue = parseValueWithSuffix(value, type, suffix);

    // Apply inverse scaling if provided (e.g., for percentages: 1 -> 0.01)
    if (scale && typeof parsedValue === "number") {
      return parsedValue / scale;
    }

    return parsedValue;
  }
}

export default n;
