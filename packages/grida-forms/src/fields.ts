import type { FormInputType } from "./model";

const html5_file_alias_field_types = new Set<FormInputType>([
  "file",
  "image",
  "audio",
  "video",
]);

const html5_multiple_supported_field_types = new Set<FormInputType>([
  ...html5_file_alias_field_types,
  "toggle-group",
  // TODO: this needs to be supported - work with the db first.
  // "email",
  // "select",
]);

const html5_accept_supported_field_types = new Set<FormInputType>(
  html5_file_alias_field_types
);

export const options_supported_field_types = new Set<FormInputType>([
  "select",
  "radio",
  "checkboxes",
  "toggle-group",
]);

/**
 * html5 pattern allowed input types
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/pattern
 */
const html5_pattern_supported_field_types = new Set<FormInputType>([
  "text",
  "tel",
  // `date` uses pattern on fallback - https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input/date#handling_browser_support
  // "date",
  "email",
  "url",
  "password",
  "search",
]);

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/readonly
 */
const html5_readonly_supported_field_types = new Set<FormInputType>([
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
]);

const html5_checkbox_alias_field_types = new Set<FormInputType>([
  "checkbox",
  "switch",
]);

const html5_placeholder_not_supported_field_types = new Set<FormInputType>([
  ...html5_file_alias_field_types,
  ...html5_checkbox_alias_field_types,
  "toggle",
  "toggle-group",
  "radio",
  "date",
  "datetime-local",
  "time",
  "range",
]);

const html5_autocomplete_excluded_field_types = new Set<FormInputType>([
  ...html5_file_alias_field_types,
  ...html5_checkbox_alias_field_types,
  "toggle",
  "toggle-group",
  "radio",
  "richtext",
  "range",
  "hidden",
  "payment",
]);

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
    return options_supported_field_types.has(type);
  }

  export function multiple(type: FormInputType) {
    return html5_multiple_supported_field_types.has(type);
  }

  export function accept(type: FormInputType) {
    return html5_accept_supported_field_types.has(type);
  }

  export function autocomplete(type: FormInputType) {
    return !html5_autocomplete_excluded_field_types.has(type);
  }

  export function placeholder(type: FormInputType) {
    return !html5_placeholder_not_supported_field_types.has(type);
  }

  export function checkbox_alias(type: FormInputType) {
    return html5_checkbox_alias_field_types.has(type);
  }

  export function boolean(type: FormInputType) {
    return checkbox_alias(type);
  }

  export function enums(type: FormInputType) {
    return options(type);
  }

  export function file_alias(type?: FormInputType) {
    if (!type) return false;
    return html5_file_alias_field_types.has(type);
  }

  export function file_upload(type: FormInputType) {
    return file_alias(type) || richtext(type);
  }

  export function search(type: FormInputType) {
    return type === "search";
  }

  export function pattern(type: FormInputType) {
    return html5_pattern_supported_field_types.has(type);
  }

  export function readonly(type: FormInputType) {
    return html5_readonly_supported_field_types.has(type);
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
