import type {
  FormFieldDefinition,
  FormFieldDataSchema,
  Option,
  Optgroup,
} from "./model";
import type { PublicFormField } from "./contracts";

export function projectFormOption(option: Option): Option {
  const { id, label, value, src, disabled, index, optgroup_id } = option;
  return { id, label, value, src, disabled, index, optgroup_id };
}
export function projectFormOptgroup(group: Optgroup): Optgroup {
  const { id, label, disabled, index } = group;
  return { id, label, disabled, index };
}
function projectFieldData(
  field: FormFieldDefinition
): FormFieldDataSchema | null | undefined {
  if (field.data == null) return field.data;
  if (typeof field.data !== "object") return undefined;
  if (field.type === "tel") {
    const data = field.data as { default_country?: unknown };
    return typeof data.default_country === "string"
      ? { default_country: data.default_country }
      : {};
  }
  if (field.type === "payment") {
    const data = field.data as { service_provider?: unknown };
    if (
      data.service_provider === "stripe" ||
      data.service_provider === "tosspayments"
    ) {
      return { type: "payment", service_provider: data.service_provider };
    }
  }
  return {};
}
/** Public render projection; never serialize arbitrary database field columns. */
export function projectFormField(field: FormFieldDefinition): PublicFormField {
  return {
    id: field.id,
    local_index: field.local_index,
    name: field.name,
    label: field.label,
    type: field.type,
    is_array: field.is_array,
    placeholder: field.placeholder,
    required: field.required,
    readonly: field.readonly,
    help_text: field.help_text,
    pattern: field.pattern,
    step: field.step,
    min: field.min,
    max: field.max,
    options: field.options?.map(projectFormOption),
    optgroups: field.optgroups?.map(projectFormOptgroup),
    autocomplete: field.autocomplete,
    data: projectFieldData(field),
    accept: field.accept,
    multiple: field.multiple,
    v_value: field.v_value,
  };
}
