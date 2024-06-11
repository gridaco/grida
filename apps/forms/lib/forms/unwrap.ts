import type { FormInputType } from "@/types";

export function unwrapFeildValue(
  value: any,
  type: FormInputType,
  options?: {
    obscure?: boolean;
  }
): string | number | boolean {
  if (!value) return "N/A";
  try {
    const unwrapped = JSON.parse(value);

    switch (type) {
      case "email":
      case "tel":
      case "text":
        return unwrapped;
      case "password":
        return options?.obscure ? "●".repeat(unwrapped.length) : unwrapped;
      case "switch":
      case "checkbox":
        return parseCheckboxValue(unwrapped);
      default:
        return unwrapped;
    }
  } catch (e) {
    switch (typeof value) {
      case "object":
      case "symbol":
      case "undefined":
        return "N/A";
      default:
        return value;
    }
  }
}

function parseCheckboxValue(value: "on" | "off"): boolean {
  return value === "on";
}
