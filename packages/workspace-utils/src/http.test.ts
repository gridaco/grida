import { expect, test } from "vitest";
import { haccept, qboolean, qval, safeSearchParams } from "./http";

test("JSON takes precedence over HTML and absent accept defaults to JSON", () => {
  expect(haccept("text/html, application/json")).toBe("application/json");
  expect(haccept("text/html")).toBe("text/html");
  expect(haccept(null)).toBe("application/json");
});

test("form boolean flags use the existing case-sensitive vocabulary", () => {
  for (const value of ["1", "true", "on", "yes", "y"])
    expect(qboolean(value)).toBe(true);
  for (const value of [null, "", "false", "0", "TRUE", "off"])
    expect(qboolean(value)).toBe(false);
  expect(qval("")).toBeNull();
  expect(qval("0")).toBe("0");
});

test("query serialization keeps falsy values but omits absent values", () => {
  expect(
    safeSearchParams({ zero: 0, no: false, empty: "", absent: null }).toString()
  ).toBe("zero=0&no=false&empty=");
});
