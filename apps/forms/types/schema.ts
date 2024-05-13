import type { FormFieldAutocompleteType, FormInputType } from ".";

/**
 * used when representing a type in json following the schema.
 *
 * `"enum" | ["enum"] | { type: "array", type: "enum" }`
 */
type JSONSchemaOptionalArrayDescriptor<T> =
  | T
  | [T]
  | {
      type: "array";
      items: {
        type: T;
      };
    };

type JSONOptionalArrayAnnotation<T> = T | [T];

interface _JSONForm<T> {
  title?: string;
  name: string;
  description?: string;
  action?: string;
  enctype?:
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/plain";
  method?: "get" | "post" | "dialog";
  novalidate?: boolean;
  target?: "_blank" | "_self" | "_parent" | "_top";
  fields?: _JSONField<T>[];
}

export type JSONForm = _JSONForm<JSONOptionalArrayAnnotation<FormInputType>>;
export type JSONFormRaw = _JSONForm<
  JSONSchemaOptionalArrayDescriptor<FormInputType>
>;
type _JSONField<T> = {
  name: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  type: T;
  options?: JSONOptionLike[];
  multiple?: boolean;
  autocomplete?: FormFieldAutocompleteType | FormFieldAutocompleteType[];
};

export type JSONFieldRaw = _JSONField<
  JSONSchemaOptionalArrayDescriptor<FormInputType>
>;

export type JSONField = _JSONField<JSONOptionalArrayAnnotation<FormInputType>>;

export type JSONOptionLike = JSONOption | string | number;

export interface JSONOption {
  value: string;
  label?: string;
  src?: string;
  disabled?: boolean;
}

function json_optional_array_descriptor_to_annotation<
  T extends string = string,
>(
  descriptor: JSONSchemaOptionalArrayDescriptor<T>
): JSONOptionalArrayAnnotation<T> {
  switch (typeof descriptor) {
    case "string":
      return descriptor;
    case "object":
      if (Array.isArray(descriptor)) {
        return [descriptor[0]];
      }
      return [descriptor.items.type];
  }
}

export function parse_jsonfield_type(
  descriptor: JSONSchemaOptionalArrayDescriptor<FormInputType>
): { type: FormInputType; is_array: boolean } {
  const annotation = json_optional_array_descriptor_to_annotation(descriptor);
  if (Array.isArray(annotation)) {
    return { type: annotation[0], is_array: true };
  }
  return { type: annotation, is_array: false };
}

export function parse_jsonfield(raw: JSONFieldRaw): JSONField {
  return {
    ...raw,
    type: json_optional_array_descriptor_to_annotation(raw.type),
  };
}

export function parse(value?: string | object): JSONForm | null | undefined {
  try {
    const shema_raw: JSONFormRaw =
      typeof value === "string"
        ? value
          ? JSON.parse(value)
          : null
        : (value as JSONFormRaw);
    if (shema_raw) {
      return <JSONForm>{
        ...shema_raw,
        fields: shema_raw.fields?.map(parse_jsonfield),
      };
    }
  } catch (error) {
    return null;
  }
}
