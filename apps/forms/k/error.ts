export const MISSING_REQUIRED_HIDDEN_FIELDS = {
  code: "MISSING_REQUIRED_HIDDEN_FIELDS",
  message:
    "Missing required hidden fields. Please provide all required hidden fields via query params or SDK",
} as const;

export const REQUIRED_HIDDEN_FIELD_NOT_USED = {
  code: "REQUIRED_HIDDEN_FIELD_NOT_USED",
  message:
    "Hidden field is configured as required but not present in the form render blocks",
} as const;

export const UNKNOWN_FIELDS_NOT_ALLOWED = {
  code: "UNKNOWN_FIELDS_NOT_ALLOWED",
  message:
    "To allow unknown fields, set 'unknown_field_handling_strategy' to 'ignore' or 'accept' in the form settings.",
} as const;

export const POSSIBLE_CUSTOMER_IDENTITY_FORGE = {
  code: "POSSIBLE_CUSTOMER_IDENTITY_FORGE",
  message: "Are you a hacker? - Possible customer identity forge detected",
} as const;

export const UUID_FORMAT_MISMATCH = {
  code: "UUID_FORMAT_MISMATCH",
  message: "UUID format mismatch",
} as const;

export const VISITORID_FORMAT_MISMATCH = {
  code: "VISITORID_FORMAT_MISMATCH",
  message: "visitor id format mismatch possible forge attempt",
} as const;

export const FORM_RESPONSE_LIMIT_REACHED = {
  code: "FORM_RESPONSE_LIMIT_REACHED",
  message: "Form response limit reached",
} as const;

export const FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED = {
  code: "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED",
  message: "Form response limit by customer reached",
} as const;

export const FORM_CLOSED_WHILE_RESPONDING = {
  code: "FORM_CLOSED_WHILE_RESPONDING",
  message: "Form closed while responding",
} as const;

export const FORM_SCHEDULE_NOT_IN_RANGE = {
  code: "FORM_SCHEDULE_NOT_IN_RANGE",
  message: "Form is not yet scheduled or already expired",
} as const;

export const FORM_FORCE_CLOSED = {
  code: "FORM_FORCE_CLOSED",
  message: "The form is force closed",
} as const;

export const FORM_SOLD_OUT = {
  code: "FORM_SOLD_OUT",
  message: "The form is sold out",
} as const;

export const FORM_OPTION_UNAVAILABLE = {
  code: "FORM_OPTION_UNAVAILABLE",
  message: "The form option is unavailable",
} as const;
