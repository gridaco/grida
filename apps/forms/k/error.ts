export const MISSING_REQUIRED_HIDDEN_FIELDS = {
  code: "MISSING_REQUIRED_HIDDEN_FIELDS",
  message:
    "Missing required hidden fields. Please provide all required hidden fields via query params or SDK",
} as const;

export const UUID_FORMAT_MISMATCH = {
  code: "UUID_FORMAT_MISMATCH",
  message: "UUID format mismatch",
} as const;

export const FORM_RESPONSE_LIMIT_REACHED = {
  code: "FORM_RESPONSE_LIMIT_REACHED",
  message: "Form response limit reached",
} as const;

export const FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED = {
  code: "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED",
  message: "Form response limit by customer reached",
} as const;
