import type { FormInputType, JSONValue } from "@/types";

export function unwrapFeildValue(
  value: any,
  type?: FormInputType
): JSONValue | string | number | boolean | undefined | null {
  if (value === null) return null;
  if (value === undefined) return undefined;

  switch (type) {
    case "email":
    case "tel":
    case "text":
    case "number":
    case "textarea":
      return value;
    case "password":
      return "●".repeat(value.length);
    case "switch":
    case "checkbox":
      return parseCheckboxValue(value);
    default:
      return value;
  }
}

function parseCheckboxValue(value: "on" | "off" | boolean): boolean {
  if (typeof value === "boolean") return value;
  return value === "on";
}
