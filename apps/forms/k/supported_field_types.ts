import { FormFieldAutocompleteType, FormInputType } from "@/types";

export const supported_field_types: FormInputType[] = [
  "text",
  "textarea",
  "select",
  "checkbox",
  "checkboxes",
  "switch",
  "radio",
  "email",
  "tel",
  "url",
  "password",
  "signature",
  "payment",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "file",
  "image",
  "color",
  "hidden",
  "range",
  "search",
];

export const supported_field_autocomplete_types: FormFieldAutocompleteType[] = [
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
];

const html5_file_alias_field_types: FormInputType[] = ["file", "image"];

const html5_multiple_supported_field_types: FormInputType[] = [
  ...html5_file_alias_field_types,
  "email",
  "select",
];

const html5_accept_supported_field_types: FormInputType[] = [
  ...html5_file_alias_field_types,
];

export const options_supported_field_types: FormInputType[] = [
  "select",
  "radio",
  "checkboxes",
  "toggle-group",
];

/**
 * html5 pattern allowed input types
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern
 */
const html5_pattern_supported_field_types: FormInputType[] = [
  "text",
  "tel",
  // `date` uses pattern on fallback - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date#handling_browser_support
  "date",
  "email",
  "url",
  "password",
  "search",
];

const html5_checkbox_alias_field_types: FormInputType[] = [
  "checkbox",
  "switch",
];

const html5_placeholder_not_supported_field_types: FormInputType[] = [
  ...html5_file_alias_field_types,
  ...html5_checkbox_alias_field_types,
  "range",
];

const html5_autocomplete_supported_field_types: FormInputType[] =
  supported_field_types.filter(
    (type) =>
      ![
        ...html5_file_alias_field_types,
        ...html5_checkbox_alias_field_types,
        "radio",
        "range",
        "hidden",
        "payment",
      ].includes(type)
  );

export namespace FieldSupports {
  export function options(type: FormInputType) {
    return options_supported_field_types.includes(type);
  }

  export function multiple(type: FormInputType) {
    return html5_multiple_supported_field_types.includes(type);
  }

  export function accept(type: FormInputType) {
    return html5_accept_supported_field_types.includes(type);
  }

  export function autocomplete(type: FormInputType) {
    return html5_autocomplete_supported_field_types.includes(type);
  }

  export function placeholder(type: FormInputType) {
    return !html5_placeholder_not_supported_field_types.includes(type);
  }

  export function checkbox_alias(type: FormInputType) {
    return html5_checkbox_alias_field_types.includes(type);
  }

  export function file_alias(type: FormInputType) {
    return html5_file_alias_field_types.includes(type);
  }

  export function fk(type: FormInputType) {
    return type === "search";
  }

  export function pattern(type: FormInputType) {
    return html5_pattern_supported_field_types.includes(type);
  }

  /**
   * whether the field type supports numeric input
   *
   * supports
   * - min
   * - max
   * - step
   */
  export function numeric(type: FormInputType) {
    return ["number", "range"].includes(type);
  }
}
