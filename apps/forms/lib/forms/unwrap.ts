import type { FormFieldType } from "@/types";

export function unwrapFeildValue(
  value: any,
  type: FormFieldType,
  options?: {
    obscure?: boolean;
  }
): string | number | boolean {
  const unwrapped = JSON.parse(value);

  switch (type) {
    case "email":
    case "tel":
    case "text":
      return unwrapped;
    case "password":
      return options?.obscure ? "●".repeat(unwrapped.length) : unwrapped;
    case "checkbox":
      return unwrapped as boolean;
    default:
      return unwrapped;
  }
}
