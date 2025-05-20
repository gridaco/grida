import type {
  FormFieldAutocompleteType,
  FormInputType,
} from "@/grida-forms-hosted/types";

type FieldTypeAnnotation = {
  label: string;
  keywords: string[];
  description: string;
};

export const annotations: Record<FormInputType, FieldTypeAnnotation> = {
  number: {
    label: "Number",
    keywords: ["numeric", "integer", "decimal", "float", "calculation", "math"],
    description:
      "Input field for numeric values, supporting integers and decimals",
  },
  text: {
    label: "Text",
    keywords: ["string", "input", "single-line", "plain-text"],
    description: "Single-line text input field for short text entries",
  },
  textarea: {
    label: "Textarea",
    keywords: ["multiline", "paragraph", "long-text", "description"],
    description: "Multi-line text input field for longer text content",
  },
  richtext: {
    label: "Rich Text",
    keywords: ["editor", "formatted", "wysiwyg", "html", "content"],
    description: "Rich text editor supporting formatted content and HTML",
  },
  tel: {
    label: "Phone",
    keywords: ["telephone", "mobile", "contact", "phone-number"],
    description: "Input field for telephone numbers with validation",
  },
  url: {
    label: "URL",
    keywords: ["link", "website", "web-address", "hyperlink"],
    description: "Input field for web URLs with validation",
  },
  checkbox: {
    label: "Checkbox",
    keywords: ["boolean", "toggle", "yes-no", "true-false"],
    description: "Single checkbox for boolean values",
  },
  checkboxes: {
    label: "Checkboxes",
    keywords: ["multiple-choice", "multi-select", "options", "list"],
    description: "Multiple checkbox selection for choosing multiple options",
  },
  switch: {
    label: "Switch",
    keywords: ["toggle", "boolean", "on-off", "slider"],
    description: "Toggle switch for boolean values with visual feedback",
  },
  toggle: {
    label: "Toggle",
    keywords: ["switch", "boolean", "on-off", "button"],
    description: "Button-style toggle for boolean values",
  },
  "toggle-group": {
    label: "Toggle Group",
    keywords: ["multiple-choice", "button-group", "options", "selection"],
    description: "Group of toggle buttons for selecting multiple options",
  },
  radio: {
    label: "Radio",
    keywords: ["single-choice", "option", "selection", "exclusive"],
    description: "Radio buttons for selecting a single option from a list",
  },
  date: {
    label: "Date",
    keywords: ["calendar", "date-picker", "day", "month", "year"],
    description: "Date picker for selecting calendar dates",
  },
  "datetime-local": {
    label: "Date & Time",
    keywords: ["datetime", "timestamp", "calendar", "time-picker"],
    description: "Input field for selecting both date and time",
  },
  month: {
    label: "Month",
    keywords: ["calendar", "month-picker", "year-month"],
    description: "Input field for selecting month and year",
  },
  week: {
    label: "Week",
    keywords: ["calendar", "week-picker", "year-week"],
    description: "Input field for selecting week of the year",
  },
  time: {
    label: "Time",
    keywords: ["clock", "time-picker", "hour", "minute"],
    description: "Time picker for selecting specific times",
  },
  email: {
    label: "Email",
    keywords: ["mail", "contact", "address", "communication"],
    description: "Input field for email addresses with validation",
  },
  file: {
    label: "File Upload",
    keywords: ["document", "upload", "attachment", "file-picker"],
    description: "File upload field for document attachments",
  },
  image: {
    label: "Image Upload",
    keywords: ["photo", "picture", "upload", "media"],
    description: "Image upload field with preview and validation",
  },
  audio: {
    label: "Audio Upload",
    keywords: ["sound", "music", "voice", "media"],
    description: "Audio file upload field with playback support",
  },
  video: {
    label: "Video Upload",
    keywords: ["movie", "clip", "media", "streaming"],
    description: "Video file upload field with preview support",
  },
  select: {
    label: "Select",
    keywords: ["dropdown", "options", "choice", "list"],
    description: "Dropdown select field for choosing from a list of options",
  },
  latlng: {
    label: "Location",
    keywords: ["map", "coordinates", "geolocation", "address"],
    description: "Location picker with map integration",
  },
  password: {
    label: "Password",
    keywords: ["secret", "secure", "login", "authentication"],
    description: "Secure password input field with masking",
  },
  color: {
    label: "Color Picker",
    keywords: ["hex", "rgb", "palette", "design"],
    description: "Color picker with visual color selection",
  },
  country: {
    label: "Country",
    keywords: ["nation", "location", "address", "geography"],
    description: "Country selector with search and validation",
  },
  payment: {
    label: "Payment",
    keywords: ["credit-card", "transaction", "billing", "checkout"],
    description: "Payment field for processing transactions",
  },
  hidden: {
    label: "Hidden",
    keywords: ["invisible", "system", "internal", "metadata"],
    description: "Hidden field for storing system values",
  },
  signature: {
    label: "Signature",
    keywords: ["draw", "sign", "document", "approval"],
    description: "Digital signature pad for capturing signatures",
  },
  range: {
    label: "Range",
    keywords: ["slider", "scale", "min-max", "value"],
    description: "Range slider for selecting values within a range",
  },
  search: {
    label: "Search for Reference",
    keywords: ["lookup", "reference", "find", "query"],
    description: "Search field for looking up reference data",
  },
  json: {
    label: "JSON",
    keywords: ["data", "object", "structure", "code"],
    description: "JSON editor for structured data input",
  },
  canvas: {
    label: "Canvas",
    keywords: ["draw", "sketch", "paint", "art"],
    description: "Drawing canvas for free-form input",
  },
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
    "json",
    "canvas",
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

  export function search(type: FormInputType) {
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
