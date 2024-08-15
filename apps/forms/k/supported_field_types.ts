import { FormFieldAutocompleteType, FormInputType } from "@/types";

export const fieldlabels: Record<FormInputType, string> = {
  number: "Number",
  text: "Text",
  textarea: "Textarea",
  richtext: "Rich Text",
  tel: "Phone",
  url: "URL",
  checkbox: "Checkbox",
  checkboxes: "Checkboxes",
  switch: "Switch",
  toggle: "Toggle",
  "toggle-group": "Toggle Group",
  radio: "Radio",
  date: "Date",
  "datetime-local": "Date & Time",
  month: "Month",
  week: "Week",
  time: "Time",
  email: "Email",
  file: "File Upload",
  image: "Image Upload",
  audio: "Audio Upload",
  video: "Video Upload",
  select: "Select",
  latlng: "Location",
  password: "Password",
  color: "Color Picker",
  country: "Country",
  payment: "Payment",
  hidden: "Hidden",
  signature: "Signature",
  range: "Range",
  search: "Search for Reference",
};

export const supported_field_types: FormInputType[] = [
  "text",
  "textarea",
  "select",
  "checkbox",
  "switch",
  "radio",
  "toggle-group",
  "email",
  "tel",
  "url",
  "password",
  "number",
  "date",
  "datetime-local",
  "time",
  "month",
  "week",
  "file",
  "image",
  "audio",
  "video",
  "color",
  "hidden",
  "range",
  "search",
  "richtext",
];

if (process.env.NODE_ENV === "development") {
  // @ts-ignore
  const dev: FormInputType[] = [
    //
    "checkboxes",
    "signature",
    "payment",
    "toggle",
  ] as const;
  supported_field_types.push(...dev);
}

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

const html5_file_alias_field_types: FormInputType[] = [
  "file",
  "image",
  "audio",
  "video",
];

const html5_multiple_supported_field_types: FormInputType[] = [
  ...html5_file_alias_field_types,
  "toggle-group",
  // TODO: this needs to be supported - work with the db first.
  // "email",
  // "select",
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
  // "date",
  "email",
  "url",
  "password",
  "search",
];

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/readonly
 */
const html5_readonly_supported_field_types: FormInputType[] = [
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "date",
  "month",
  "week",
  "time",
  "datetime-local",
  "number",
  "textarea",
];

const html5_checkbox_alias_field_types: FormInputType[] = [
  "checkbox",
  "switch",
];

const html5_placeholder_not_supported_field_types: FormInputType[] = [
  ...html5_file_alias_field_types,
  ...html5_checkbox_alias_field_types,
  "toggle",
  "toggle-group",
  "radio",
  "date",
  "datetime-local",
  "time",
  "range",
];

const html5_autocomplete_supported_field_types: FormInputType[] =
  supported_field_types.filter(
    (type) =>
      ![
        ...html5_file_alias_field_types,
        ...html5_checkbox_alias_field_types,
        "toggle",
        "toggle-group",
        "radio",
        "richtext",
        "range",
        "hidden",
        "payment",
      ].includes(type)
  );

export namespace FieldProperties {
  export function accept(type: FormInputType) {
    switch (type) {
      case "audio":
        return "audio/*";
      case "video":
        return "video/*";
      case "image":
        return "image/*";
      default:
        return undefined;
    }
  }
}

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

  export function boolean(type: FormInputType) {
    return checkbox_alias(type);
  }

  export function enums(type: FormInputType) {
    return options(type);
  }

  export function file_alias(type?: FormInputType) {
    if (!type) return false;
    return html5_file_alias_field_types.includes(type);
  }

  export function file_upload(type: FormInputType) {
    return file_alias(type) || richtext(type);
  }

  export function fk(type: FormInputType) {
    return type === "search";
  }

  export function pattern(type: FormInputType) {
    return html5_pattern_supported_field_types.includes(type);
  }

  export function readonly(type: FormInputType) {
    return html5_readonly_supported_field_types.includes(type);
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

  export function richtext(type: FormInputType) {
    return type === "richtext";
  }

  export function payments(type: FormInputType) {
    return type === "payment";
  }

  export function computedvalue({
    type,
    readonly,
    required,
  }: {
    type: FormInputType;
    readonly?: boolean;
    required?: boolean;
  }) {
    if (type === "hidden") return !required;
    if (file_alias(type)) return false;
    if (richtext(type)) return false;
    if (payments(type)) return false;
    if (readonly) return true;
    return false;
  }

  /**
   * if the value must be a json object
   */
  export function jsonobject(type: FormInputType) {
    return richtext(type) || payments(type);
  }
}
