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
    return applyPrecision(result, precision);
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
    // Apply precision first
    const precisionValue = applyPrecision(value, precision);

    switch (type) {
      case "integer":
        // Always format as whole numbers for integer type
        return Math.round(precisionValue).toString();

      case "number":
        // For number type, preserve natural precision when step allows it
        const stepDecimals = countDecimalPlaces(step);
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
}

export default n;
