import type { JSONValue } from "./model";
import type { FormInputType } from "./model";

export function unwrapFeildValue(
  value: unknown,
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
      return value as JSONValue;
    case "password":
      return "●".repeat(String(value).length);
    case "switch":
    case "checkbox":
      return parseCheckboxValue(value as "on" | "off" | boolean);
    default:
      return value as JSONValue;
  }
}

function parseCheckboxValue(value: "on" | "off" | boolean): boolean {
  if (typeof value === "boolean") return value;
  return value === "on";
}
