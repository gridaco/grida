import n from "./n";

/**
 * @fileoverview Tests for number precision control in graphics design tool property panels
 *
 * ## Purpose
 * These tests define precision behavior for numeric inputs in design tools (like Figma, Sketch).
 * Precision controls how many decimal places are displayed/stored for properties like position, size, rotation.
 *
 * ## Precision Definition (CRITICAL)
 *
 * **Precision = Maximum decimal places that can be displayed**
 *
 * This is about LIMITING precision, not rounding to nearest values.
 * Think of it as "show at most N decimal places".
 *
 * ### Examples
 * ```typescript
 * // precision=1 means "show at most 1 decimal place"
 * n.applyPrecision(123.456, 1) → 123.5  // 3 decimals → 1 decimal (rounded)
 * n.applyPrecision(123.4, 1)   → 123.4  // already ≤1 decimal (preserved)
 * n.applyPrecision(123.0, 1)   → 123    // trailing zeros removed
 * n.applyPrecision(123, 1)     → 123    // integers always preserved
 *
 * // precision=2 means "show at most 2 decimal places"
 * n.applyPrecision(123.456, 2) → 123.46 // 3 decimals → 2 decimals (rounded)
 * n.applyPrecision(123.45, 2)  → 123.45 // already ≤2 decimals (preserved)
 * n.applyPrecision(123.00, 2)  → 123    // trailing zeros removed
 * ```
 *
 * ### Design Tool Context
 * - Position (X,Y): precision=1 → "123.5px" (not "123.456px")
 * - Size (W,H): precision=0 → "100px" (not "100.7px")
 * - Rotation: precision=1 → "45.7°" (not "45.67°")
 * - Opacity: precision=2 → "0.75" (not "0.7500")
 *
 * ### Core Rules
 * 1. **Round excess decimals** - 123.456 with precision=1 becomes 123.5
 * 2. **Preserve valid decimals** - 123.4 with precision=1 stays 123.4
 * 3. **Remove trailing zeros** - 123.0 becomes 123
 * 4. **Preserve integers** - 123 always stays 123
 * 5. **Clean floating point artifacts** - 0.7000000000000001 becomes 0.7
 */

describe("n.applyPrecision", () => {
  describe("precision=1 (show at most 1 decimal place)", () => {
    test("should preserve integers (no decimal places)", () => {
      // Integers have 0 decimal places, which is ≤ 1, so they're preserved
      expect(n.applyPrecision(1, 1)).toBe(1);
      expect(n.applyPrecision(12, 1)).toBe(12);
      expect(n.applyPrecision(123, 1)).toBe(123);
      expect(n.applyPrecision(1900, 1)).toBe(1900);
      expect(n.applyPrecision(12345, 1)).toBe(12345);
      expect(n.applyPrecision(-1, 1)).toBe(-1);
      expect(n.applyPrecision(-12, 1)).toBe(-12);
      expect(n.applyPrecision(-1900, 1)).toBe(-1900);
      expect(n.applyPrecision(0, 1)).toBe(0);
    });

    test("should preserve numbers with exactly 1 decimal place", () => {
      // These already have ≤1 decimal place, so they're preserved
      expect(n.applyPrecision(0.9, 1)).toBe(0.9);
      expect(n.applyPrecision(0.8, 1)).toBe(0.8);
      expect(n.applyPrecision(0.7, 1)).toBe(0.7);
      expect(n.applyPrecision(0.6, 1)).toBe(0.6);
      expect(n.applyPrecision(0.5, 1)).toBe(0.5);
      expect(n.applyPrecision(0.4, 1)).toBe(0.4);
      expect(n.applyPrecision(0.3, 1)).toBe(0.3);
      expect(n.applyPrecision(0.2, 1)).toBe(0.2);
      expect(n.applyPrecision(0.1, 1)).toBe(0.1);
    });

    test("should preserve larger numbers with 1 decimal place", () => {
      expect(n.applyPrecision(1, 1)).toBe(1);
      expect(n.applyPrecision(1.1, 1)).toBe(1.1);
      expect(n.applyPrecision(1.2, 1)).toBe(1.2);
      expect(n.applyPrecision(1.3, 1)).toBe(1.3);
      expect(n.applyPrecision(1.4, 1)).toBe(1.4);
      expect(n.applyPrecision(1.5, 1)).toBe(1.5);
      expect(n.applyPrecision(1.6, 1)).toBe(1.6);
      expect(n.applyPrecision(1.7, 1)).toBe(1.7);
      expect(n.applyPrecision(1.8, 1)).toBe(1.8);
      expect(n.applyPrecision(1.9, 1)).toBe(1.9);
    });

    test("should round numbers with 2 decimal places to 1 decimal place", () => {
      // 2 decimals > 1 decimal limit, so round to 1 decimal
      expect(n.applyPrecision(1.13, 1)).toBe(1.1); // 1.13 → 1.1
      expect(n.applyPrecision(1.23, 1)).toBe(1.2); // 1.23 → 1.2
      expect(n.applyPrecision(1.34, 1)).toBe(1.3); // 1.34 → 1.3
      expect(n.applyPrecision(1.45, 1)).toBe(1.5); // 1.45 → 1.5
      expect(n.applyPrecision(1.56, 1)).toBe(1.6); // 1.56 → 1.6
      expect(n.applyPrecision(1.67, 1)).toBe(1.7); // 1.67 → 1.7
      expect(n.applyPrecision(1.78, 1)).toBe(1.8); // 1.78 → 1.8
      expect(n.applyPrecision(1.89, 1)).toBe(1.9); // 1.89 → 1.9
      expect(n.applyPrecision(1.99, 1)).toBe(2); // 1.99 → 2.0 → 2 (trailing zero removed)
    });

    test("should round larger numbers with 2 decimal places", () => {
      expect(n.applyPrecision(10.13, 1)).toBe(10.1);
      expect(n.applyPrecision(10.23, 1)).toBe(10.2);
      expect(n.applyPrecision(10.34, 1)).toBe(10.3);
      expect(n.applyPrecision(10.45, 1)).toBe(10.5);
      expect(n.applyPrecision(100.13, 1)).toBe(100.1);
      expect(n.applyPrecision(100.23, 1)).toBe(100.2);
    });

    test("should preserve larger numbers with ≤1 decimal places", () => {
      expect(n.applyPrecision(2, 1)).toBe(2);
      expect(n.applyPrecision(2.1, 1)).toBe(2.1);
      expect(n.applyPrecision(2.9, 1)).toBe(2.9);
      expect(n.applyPrecision(10, 1)).toBe(10);
      expect(n.applyPrecision(10.1, 1)).toBe(10.1);
      expect(n.applyPrecision(10.9, 1)).toBe(10.9);
      expect(n.applyPrecision(100, 1)).toBe(100);
      expect(n.applyPrecision(100.1, 1)).toBe(100.1);
      expect(n.applyPrecision(100.9, 1)).toBe(100.9);
    });

    test("should round numbers with >2 decimal places to 1 decimal place", () => {
      // More than 2 decimals > 1 decimal limit, so round to 1 decimal
      expect(n.applyPrecision(1.11, 1)).toBe(1.1); // 1.11 → 1.1
      expect(n.applyPrecision(1.234, 1)).toBe(1.2); // 1.234 → 1.2
      expect(n.applyPrecision(1.567, 1)).toBe(1.6); // 1.567 → 1.6
      expect(n.applyPrecision(12.34, 1)).toBe(12.3); // 12.34 → 12.3
      expect(n.applyPrecision(123.45, 1)).toBe(123.5); // 123.45 → 123.5
    });

    test("should round complex numbers with many decimal places", () => {
      // Many decimals > 1 decimal limit, so round to 1 decimal
      expect(n.applyPrecision(1.123, 1)).toBe(1.1); // 1.123 → 1.1
      expect(n.applyPrecision(1.2345, 1)).toBe(1.2); // 1.2345 → 1.2
      expect(n.applyPrecision(1.12345, 1)).toBe(1.1); // 1.12345 → 1.1
    });

    test("should handle negative numbers with same rules", () => {
      expect(n.applyPrecision(-0.9, 1)).toBe(-0.9); // ≤1 decimal, preserved
      expect(n.applyPrecision(-1.1, 1)).toBe(-1.1); // ≤1 decimal, preserved
      expect(n.applyPrecision(-1.11, 1)).toBe(-1.1); // 2 decimals → 1 decimal
      expect(n.applyPrecision(-2.1, 1)).toBe(-2.1); // ≤1 decimal, preserved
      expect(n.applyPrecision(-10.1, 1)).toBe(-10.1); // ≤1 decimal, preserved
    });
  });

  describe("precision=2 (show at most 2 decimal places)", () => {
    test("should preserve integers (no decimal places)", () => {
      // Integers have 0 decimal places, which is ≤ 2, so they're preserved
      expect(n.applyPrecision(1, 2)).toBe(1);
      expect(n.applyPrecision(12, 2)).toBe(12);
      expect(n.applyPrecision(123, 2)).toBe(123);
      expect(n.applyPrecision(1900, 2)).toBe(1900);
      expect(n.applyPrecision(12345, 2)).toBe(12345);
      expect(n.applyPrecision(-1, 2)).toBe(-1);
      expect(n.applyPrecision(-12, 2)).toBe(-12);
      expect(n.applyPrecision(-1900, 2)).toBe(-1900);
    });

    test("should preserve numbers with ≤2 decimal places", () => {
      // These already have ≤2 decimal places, so they're preserved
      expect(n.applyPrecision(1.23, 2)).toBe(1.23); // exactly 2 decimals, preserved
      expect(n.applyPrecision(12.34, 2)).toBe(12.34); // exactly 2 decimals, preserved
      expect(n.applyPrecision(123.45, 2)).toBe(123.45); // exactly 2 decimals, preserved
      expect(n.applyPrecision(1.2, 2)).toBe(1.2); // 1 decimal, preserved
      expect(n.applyPrecision(1000.12, 2)).toBe(1000.12); // exactly 2 decimals, preserved
    });

    test("should round numbers with >2 decimal places to 2 decimal places", () => {
      // More than 2 decimals > 2 decimal limit, so round to 2 decimals
      expect(n.applyPrecision(0.123, 2)).toBe(0.12); // 3 decimals → 2 decimals
      expect(n.applyPrecision(0.0123, 2)).toBe(0.01); // 4 decimals → 2 decimals
      expect(n.applyPrecision(1.2345, 2)).toBe(1.23); // 4 decimals → 2 decimals
      expect(n.applyPrecision(12.3456, 2)).toBe(12.35); // 4 decimals → 2 decimals
    });
  });

  describe("precision=3 (show at most 3 decimal places)", () => {
    test("should preserve integers (no decimal places)", () => {
      // Integers have 0 decimal places, which is ≤ 3, so they're preserved
      expect(n.applyPrecision(1, 3)).toBe(1);
      expect(n.applyPrecision(12, 3)).toBe(12);
      expect(n.applyPrecision(123, 3)).toBe(123);
      expect(n.applyPrecision(1900, 3)).toBe(1900);
      expect(n.applyPrecision(12345, 3)).toBe(12345);
      expect(n.applyPrecision(-1, 3)).toBe(-1);
      expect(n.applyPrecision(-12, 3)).toBe(-12);
      expect(n.applyPrecision(-1900, 3)).toBe(-1900);
    });

    test("should preserve numbers with ≤3 decimal places", () => {
      // These already have ≤3 decimal places, so they're preserved
      expect(n.applyPrecision(1.234, 3)).toBe(1.234); // exactly 3 decimals, preserved
      expect(n.applyPrecision(12.345, 3)).toBe(12.345); // exactly 3 decimals, preserved
      expect(n.applyPrecision(123.456, 3)).toBe(123.456); // exactly 3 decimals, preserved
      expect(n.applyPrecision(1.23, 3)).toBe(1.23); // 2 decimals, preserved
      expect(n.applyPrecision(1.2, 3)).toBe(1.2); // 1 decimal, preserved
    });

    test("should round numbers with >3 decimal places to 3 decimal places", () => {
      // More than 3 decimals > 3 decimal limit, so round to 3 decimals
      expect(n.applyPrecision(0.1234, 3)).toBe(0.123); // 4 decimals → 3 decimals
      expect(n.applyPrecision(1.2345, 3)).toBe(1.235); // 4 decimals → 3 decimals
      expect(n.applyPrecision(12.34567, 3)).toBe(12.346); // 5 decimals → 3 decimals
    });
  });

  describe("floating point artifacts and trailing zeros", () => {
    test("should clean floating point precision artifacts", () => {
      // JavaScript floating point precision artifacts should be cleaned
      expect(n.applyPrecision(0.7000000000000001, 1)).toBe(0.7); // artifact → 0.7
      expect(n.applyPrecision(0.30000000000000004, 1)).toBe(0.3); // artifact → 0.3
      expect(n.applyPrecision(1.0000000000000002, 1)).toBe(1); // artifact → 1.0 → 1
      expect(n.applyPrecision(1.1000000000000001, 1)).toBe(1.1); // artifact → 1.1
      expect(n.applyPrecision(0.10000000000000002, 1)).toBe(0.1); // artifact → 0.1
      expect(n.applyPrecision(0.20000000000000004, 1)).toBe(0.2); // artifact → 0.2

      // Test with higher precision
      expect(n.applyPrecision(0.7000000000000001, 2)).toBe(0.7); // artifact → 0.7
      expect(n.applyPrecision(0.12345678901234568, 2)).toBe(0.12); // many decimals → 0.12
    });

    test("should remove trailing zeros", () => {
      // Numbers that end in .0 should have trailing zeros removed
      expect(n.applyPrecision(5.0, 1)).toBe(5); // 5.0 → 5
      expect(n.applyPrecision(20.0, 1)).toBe(20); // 20.0 → 20
      expect(n.applyPrecision(100.0, 1)).toBe(100); // 100.0 → 100
      expect(n.applyPrecision(-50.0, 1)).toBe(-50); // -50.0 → -50

      // Numbers with actual decimal values should preserve them
      expect(n.applyPrecision(0.7, 1)).toBe(0.7); // 0.7 stays 0.7
      expect(n.applyPrecision(1.2, 1)).toBe(1.2); // 1.2 stays 1.2
      expect(n.applyPrecision(0.123, 3)).toBe(0.123); // 0.123 stays 0.123
    });

    test("should handle floating point arithmetic issues", () => {
      // Common JavaScript floating point arithmetic issues should be resolved
      expect(n.applyPrecision(0.1 + 0.2, 1)).toBe(0.3); // 0.30000000000000004 → 0.3
      expect(n.applyPrecision(0.3, 1)).toBe(0.3); // 0.3 stays 0.3
      expect(n.applyPrecision(0.7 - 0.1, 1)).toBe(0.6); // 0.5999999999999999 → 0.6
      expect(n.applyPrecision(1.1 + 0.1, 1)).toBe(1.2); // 1.2000000000000002 → 1.2
    });
  });

  describe("edge cases", () => {
    test("should handle special values", () => {
      expect(n.applyPrecision(0, 1)).toBe(0);
      expect(n.applyPrecision(Infinity, 1)).toBe(Infinity);
      expect(n.applyPrecision(-Infinity, 1)).toBe(-Infinity);
      expect(n.applyPrecision(NaN, 1)).toBe(NaN);
    });

    test("should handle precision=0 (no decimal places)", () => {
      // precision=0 means "show at most 0 decimal places" (integers only)
      expect(n.applyPrecision(1.234, 0)).toBe(1); // 1.234 → 1
      expect(n.applyPrecision(1.9, 0)).toBe(2); // 1.9 → 2
      expect(n.applyPrecision(1.1, 0)).toBe(1); // 1.1 → 1
      expect(n.applyPrecision(5, 0)).toBe(5); // 5 → 5 (already integer)
    });
  });

  describe("design tool property panel scenarios", () => {
    test("should handle position coordinates (precision=1)", () => {
      // Position properties typically use precision=1
      expect(n.applyPrecision(123.456, 1)).toBe(123.5); // X position: 123.456px → 123.5px
      expect(n.applyPrecision(45.789, 1)).toBe(45.8); // Y position: 45.789px → 45.8px
      expect(n.applyPrecision(100.0, 1)).toBe(100); // Clean position: 100.0px → 100px
    });

    test("should handle size dimensions (precision=0)", () => {
      // Size properties often use precision=0 for clean pixel values
      expect(n.applyPrecision(200.7, 0)).toBe(201); // Width: 200.7px → 201px
      expect(n.applyPrecision(150.3, 0)).toBe(150); // Height: 150.3px → 150px
      expect(n.applyPrecision(100.0, 0)).toBe(100); // Clean size: 100.0px → 100px
    });

    test("should handle rotation angles (precision=1)", () => {
      // Rotation typically uses precision=1
      expect(n.applyPrecision(45.67, 1)).toBe(45.7); // 45.67° → 45.7°
      expect(n.applyPrecision(90.0, 1)).toBe(90); // 90.0° → 90°
      expect(n.applyPrecision(180.12, 1)).toBe(180.1); // 180.12° → 180.1°
    });

    test("should handle opacity values (precision=2)", () => {
      // Opacity often uses precision=2 for fine control
      expect(n.applyPrecision(0.1234, 2)).toBe(0.12); // 0.1234 → 0.12
      expect(n.applyPrecision(0.9876, 2)).toBe(0.99); // 0.9876 → 0.99
      expect(n.applyPrecision(1.0, 2)).toBe(1); // 1.0 → 1
    });
  });
});

describe("n.roundToStep", () => {
  test("should round with integer type", () => {
    // Integer type should round to nearest integer
    expect(n.roundToStep(1.234, 1, "integer")).toBe(1);
    expect(n.roundToStep(0.9, 1, "integer")).toBe(1);
    expect(n.roundToStep(1.6, 1, "integer")).toBe(2);
  });

  test("should preserve precision with number type and integer step", () => {
    // Number type with integer step should preserve original precision
    expect(n.roundToStep(1.234, 1, "number", 10)).toBe(1.234);
    expect(n.roundToStep(0.9, 1, "number", 10)).toBe(0.9);
    expect(n.roundToStep(5.1, 1, "number", 10)).toBe(5.1);
  });

  test("should apply step precision with number type and decimal step", () => {
    // Number type with decimal step should round to step precision
    expect(n.roundToStep(1.234, 0.1, "number", 10)).toBe(1.2);
    expect(n.roundToStep(1.234, 0.01, "number", 10)).toBe(1.23);
  });

  test("should handle precision parameter", () => {
    expect(n.roundToStep(1.234, 1, "integer", 2)).toBe(1); // Integer type ignores precision
    expect(n.roundToStep(1.234, 1, "number", 2)).toBe(1.23); // Number type applies precision (2 decimal places)
  });

  test("should handle unknown types gracefully", () => {
    // @ts-expect-error Testing unknown type
    expect(n.roundToStep(1.234, 1, "unknown", 10)).toBe(1.234);
  });
});

describe("n.formatValueWithPrecision", () => {
  test("should format with integer type", () => {
    // Integer type should format as integers
    expect(n.formatValueWithPrecision(1.234, 1, "integer")).toBe("1");
    expect(n.formatValueWithPrecision(0.9, 1, "integer")).toBe("1");
    expect(n.formatValueWithPrecision(5.1, 1, "integer")).toBe("5");
  });

  test("should preserve precision with number type and integer step", () => {
    // Number type with integer step should preserve original precision
    expect(n.formatValueWithPrecision(1.234, 1, "number", 10)).toBe("1.234");
    expect(n.formatValueWithPrecision(0.9, 1, "number", 10)).toBe("0.9");
    expect(n.formatValueWithPrecision(5.0, 1, "number", 10)).toBe("5");
  });

  test("should apply step precision with number type and decimal step", () => {
    // Number type with decimal step should format to step precision
    expect(n.formatValueWithPrecision(1.234, 0.1, "number", 10)).toBe("1.2");
    expect(n.formatValueWithPrecision(1.234, 0.01, "number", 10)).toBe("1.23");
    expect(n.formatValueWithPrecision(5.1, 0.1, "number", 10)).toBe("5.1");
  });

  test("should handle precision parameter", () => {
    expect(n.formatValueWithPrecision(1.234, 1, "integer", 2)).toBe("1");
    expect(n.formatValueWithPrecision(1.234, 1, "number", 2)).toBe("1.23");
  });

  test("should remove trailing zeros", () => {
    expect(n.formatValueWithPrecision(5.0, 0.01, "number", 10)).toBe("5");
    expect(n.formatValueWithPrecision(5.1, 0.1, "number", 10)).toBe("5.1");
  });

  test("should handle unknown types gracefully", () => {
    // @ts-expect-error Testing unknown type
    expect(n.formatValueWithPrecision(1.234, 1, "unknown", 10)).toBe("1.234");
  });
});

describe("Integration tests", () => {
  test("should work together correctly", () => {
    const value = 1.234567;
    const step = 0.01;
    const type = "number" as const;
    const precision = 10; // Use high precision to preserve step-based rounding

    const rounded = n.roundToStep(value, step, type, precision);
    const formatted = n.formatValueWithPrecision(value, step, type, precision);

    expect(rounded).toBe(1.23);
    expect(formatted).toBe("1.23");
  });

  test("should handle precision=0 edge case", () => {
    const value = 1.9;
    const step = 1;
    const type = "number" as const;
    const precision = 0; // No decimal places

    const rounded = n.roundToStep(value, step, type, precision);
    const formatted = n.formatValueWithPrecision(value, step, type, precision);

    expect(rounded).toBe(2); // 1.9 → 2
    expect(formatted).toBe("2"); // 1.9 → 2
  });
});
