import type { FormInputType } from "@/types";

export function unwrapFeildValue(
  value: any,
  type?: FormInputType
): string | number | boolean | undefined | null {
  if (value === null) return null;
  if (value === undefined) return undefined;
  try {
    const unwrapped = JSON.parse(value);

    switch (type) {
      case "email":
      case "tel":
      case "text":
      case "number":
      case "textarea":
        return unwrapped;
      case "password":
        return "●".repeat(unwrapped.length);
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
      case "function":
        return "N/A";
      default:
        return value;
    }
  }
}

function parseCheckboxValue(value: "on" | "off" | boolean): boolean {
  if (typeof value === "boolean") return value;
  return value === "on";
}
