import { z } from "zod/v3";

export const zFormInputType = z.enum([
  "text",
  "textarea",
  "tel",
  "url",
  "checkbox",
  "checkboxes",
  "switch",
  "toggle",
  "toggle-group",
  "radio",
  "number",
  "date",
  "datetime-local",
  "month",
  "week",
  "time",
  "email",
  "challenge_email",
  "file",
  "image",
  "select",
  "latlng",
  "password",
  "color",
  "country",
  "payment",
  "hidden",
  "signature",
  "range",
]);

export const zFormFieldAutocompleteType = z.enum([
  "off",
  "on",
  "name",
  "honorific-prefix",
  "given-name",
  "additional-name",
  "family-name",
  "honorific-suffix",
  "nickname",
  "email",
  "username",
  "new-password",
  "current-password",
  "one-time-code",
  "organization-title",
  "organization",
  "street-address",
  "shipping",
  "billing",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level4",
  "address-level3",
  "address-level2",
  "address-level1",
  "country",
  "country-name",
  "postal-code",
  "cc-name",
  "cc-given-name",
  "cc-additional-name",
  "cc-family-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "transaction-currency",
  "transaction-amount",
  "language",
  "bday",
  "bday-day",
  "bday-month",
  "bday-year",
  "sex",
  "tel",
  "tel-country-code",
  "tel-national",
  "tel-area-code",
  "tel-local",
  "tel-extension",
  "impp",
  "url",
  "photo",
  "webauthn",
]);

export const zJSONOption = z.object({
  value: z.string(),
  label: z.string().optional(),
  src: z.string().optional(),
  disabled: z.boolean().optional(),
});

export const zJSONField = z.object({
  name: z.string().describe("HTML5 form `name` attribute"),
  label: z.string().optional().describe("User facing label"),
  placeholder: z
    .string()
    .optional()
    .describe(
      "HTML5 form `placeholder` attribute + also used for `select` input"
    ),
  required: z.boolean().optional(),
  pattern: z.string().optional(),
  type: zFormInputType
    .or(zFormInputType.array())
    .describe("`FormInputType` HTML5 + extended input type"),
  options: z.array(zJSONOption.or(z.string()).or(z.number())).optional(),
  multiple: z.boolean().optional(),
  autocomplete: zFormFieldAutocompleteType
    .or(zFormFieldAutocompleteType.array())
    .optional(),
});

export const zJSONForm = z.object({
  $schema: z
    .literal("https://grida.co/schema/form.schema.json")
    .describe("https://grida.co/schema/form.schema.json"),
  title: z.string().optional().describe("User facing form title"),
  name: z.string().describe("HTML5 form `name` attribute"),
  description: z.string().optional().describe("description for the editor"),
  action: z.string().optional().describe("HTML5 form `action` attribute"),
  enctype: z
    .enum([
      "application/x-www-form-urlencoded",
      "multipart/form-data",
      "text/plain",
    ])
    .optional()
    .describe("HTML5 form `enctype` attribute"),
  method: z
    .enum(["get", "post", "dialog"])
    .optional()
    .describe("HTML5 form `method` attribute"),
  novalidate: z
    .boolean()
    .optional()
    .describe("HTML5 form `novalidate` attribute"),
  target: z
    .enum(["_blank", "_self", "_parent", "_top"])
    .optional()
    .describe("HTML5 form `target` attribute"),
  fields: z
    .array(zJSONField)
    .optional()
    .describe("form fields definition, array of fields of `FormInputType`"),
});

/**
 * Strict-mode-compatible schema for AI generation (OpenAI structured outputs).
 *
 * OpenAI's structured output requires:
 * - Every object property listed in `required` (use `nullable` not `optional`)
 * - Every `anyOf` branch must carry a `type` key (no mixed object/primitive unions)
 * - No open-ended types (`z.any()`, `z.record()`)
 *
 * This schema is intentionally **separate** from the shared validation schemas
 * above so that strict-mode constraints don't leak into general form validation.
 */
const GENzJSONOption = z.object({
  value: z.string(),
  label: z.string().nullable(),
  src: z.string().nullable(),
  disabled: z.boolean().nullable(),
});

const GENzJSONField = z.object({
  name: z.string().describe("HTML5 form `name` attribute"),
  label: z.string().nullable().describe("User facing label"),
  placeholder: z
    .string()
    .nullable()
    .describe(
      "HTML5 form `placeholder` attribute + also used for `select` input"
    ),
  required: z.boolean().nullable(),
  pattern: z.string().nullable(),
  type: zFormInputType.describe("`FormInputType` HTML5 + extended input type"),
  options: z.array(GENzJSONOption).nullable(),
  multiple: z.boolean().nullable(),
  autocomplete: zFormFieldAutocompleteType.nullable(),
});

export const GENzJSONForm = z.object({
  $schema: z
    .literal("https://grida.co/schema/form.schema.json")
    .describe("https://grida.co/schema/form.schema.json"),
  title: z.string().nullable().describe("User facing form title"),
  name: z.string().describe("HTML5 form `name` attribute"),
  description: z.string().nullable().describe("description for the editor"),
  fields: z
    .array(GENzJSONField)
    .nullable()
    .describe("form fields definition, array of fields of `FormInputType`"),
});
