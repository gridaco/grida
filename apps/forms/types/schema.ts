import type {
  FormBlock,
  FormFieldAutocompleteType,
  FormFieldDefinition,
  FormInputType,
  FormsPageLanguage,
  Option,
} from ".";

import { toArrayOf, MaybeArray } from "./utility";

/**
 * used when representing a type in json following the schema.
 *
 * `"enum" | ["enum"] | { type: "array", type: "enum" }`
 */
type JSONSchemaOptionalDefineAsArrayDescriptor<T> =
  | T
  | [T]
  | {
      type: "array";
      items: {
        type: T;
      };
    };

type JSONOptionalDefineAsArrayAnnotation<T> = T | [T];

type JSONFieldReference = {
  $ref: `#/fields/${string}`;
};

type JSONLiteral = string | number | boolean;

type JSONConditionLefthand = JSONFieldReference | JSONLiteral;

type JSONConditionOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";

type JSONConditionRighthand = JSONFieldReference | JSONLiteral;

type JSONCondition = [
  JSONConditionLefthand,
  JSONConditionOperator,
  JSONConditionRighthand,
];

type JSONBooleanValueDescriptor = boolean | JSONCondition;

interface JSONFieldBlock {
  type: "field";
  field: JSONFieldReference;
  hidden?: JSONBooleanValueDescriptor;
}

interface _JSONForm<T> {
  title?: string;
  name: string;
  description?: string;
  lang?: FormsPageLanguage;
  action?: string;
  enctype?:
    | "application/x-www-form-urlencoded"
    | "multipart/form-data"
    | "text/plain";
  method?: "get" | "post" | "dialog";
  novalidate?: boolean;
  target?: "_blank" | "_self" | "_parent" | "_top";
  fields?: T[];
  blocks?: JSONFieldBlock[];
}

export type JSONForm = _JSONForm<FormFieldDefinition>;
export type JSONFormRaw = _JSONForm<
  _JSONField<JSONSchemaOptionalDefineAsArrayDescriptor<FormInputType>>
>;
type _JSONField<T> = {
  name: string;
  label?: string | null;
  placeholder?: string | null;
  required?: boolean;
  pattern?: string;
  type: T;
  options?: JSONOptionLike[];
  multiple?: boolean | null;
  autocomplete?: FormFieldAutocompleteType | FormFieldAutocompleteType[] | null;
};

export type JSONFieldRaw = _JSONField<
  JSONSchemaOptionalDefineAsArrayDescriptor<FormInputType>
>;

export type JSONOptionLike = JSONOption | string | number;

export interface JSONOption {
  value: string;
  label?: string;
  src?: string | null;
  disabled?: boolean | null;
}

function json_optional_define_as_array_descriptor_to_annotation<
  T extends string = string,
>(
  descriptor: JSONSchemaOptionalDefineAsArrayDescriptor<T>
): JSONOptionalDefineAsArrayAnnotation<T> {
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
  descriptor: JSONSchemaOptionalDefineAsArrayDescriptor<FormInputType>
): { type: FormInputType; is_array: boolean } {
  const annotation =
    json_optional_define_as_array_descriptor_to_annotation(descriptor);
  if (Array.isArray(annotation)) {
    return { type: annotation[0], is_array: true };
  }
  return { type: annotation, is_array: false };
}

export function parse(
  value?: string | JSONFormRaw
): JSONForm | null | undefined {
  return new JSONFormParser(value).parse();
}

export class JSONFormParser {
  readonly schema: JSONFormRaw | null | undefined;
  constructor(value?: string | JSONFormRaw) {
    try {
      this.schema =
        typeof value === "string"
          ? value
            ? JSON.parse(value)
            : null
          : // needs validation
            (value as JSONFormRaw);
    } catch (error) {}
  }

  //

  fields(): FormFieldDefinition[] {
    return json_form_field_to_form_field_definition(this.schema?.fields);
  }

  blocks(): FormBlock[] {
    return [];
  }

  parse(): JSONForm | null | undefined {
    if (!this.schema) return null;
    return {
      ...this.schema,
      fields: this.fields(),
    };
  }
}

export function json_form_field_to_form_field_definition(
  fields?: JSONFieldRaw[]
): FormFieldDefinition[] {
  const map_option = (o: JSONOptionLike): Option => {
    switch (typeof o) {
      case "string":
      case "number": {
        return {
          id: String(o),
          value: String(o),
          label: String(o),
        };
      }
      case "object": {
        return {
          ...o,
          id: o.value,
        };
      }
    }
  };

  return (
    fields?.map((f: JSONFieldRaw, i) => {
      const { type, is_array } = parse_jsonfield_type(f.type);
      return {
        ...f,
        id: f.name,
        type: type,
        is_array,
        autocomplete: toArrayOf<FormFieldAutocompleteType | null | undefined>(
          f.autocomplete
        ),
        required: f.required || false,
        local_index: i,
        options: f.options?.map(map_option) || [],
      };
    }) || []
  );
}
