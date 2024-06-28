import { is_uuid_v4 } from "@/utils/is";
import type { FormInputType, Option } from "@/types";
import { FieldSupports } from "@/k/supported_field_types";
import { unwrapFeildValue } from "@/lib/forms/unwrap";

export namespace FormValue {
  export function parse(
    value_or_reference: any,
    extra: {
      enums?: { id: string; value: string }[];
      type?: FormInputType;
    }
  ) {
    const { type, enums } = extra;
    if (!type) {
      return {
        value: value_or_reference,
      };
    }

    if (FieldSupports.numeric(type)) {
      return {
        value: Number(value_or_reference),
      };
    }
    if (FieldSupports.boolean(type)) {
      return {
        value: unwrapFeildValue(value_or_reference, type),
      };
    }
    if (FieldSupports.jsonobject(type)) {
      switch (typeof value_or_reference) {
        case "string": {
          return {
            value: JSON.parse(value_or_reference),
          };
        }
        case "object": {
          return {
            value: value_or_reference,
          };
        }
        default: {
          return {
            value: value_or_reference,
          };
        }
      }
    }
    if (FieldSupports.enums(type)) {
      // check if the value is a reference to form_field_option
      const is_value_fkey_and_found =
        is_uuid_v4(value_or_reference as string) &&
        enums?.find((o: any) => o.id === value_or_reference);

      // locate the value
      const value = is_value_fkey_and_found
        ? is_value_fkey_and_found.value
        : value_or_reference;

      return {
        value,
        enum_id: is_value_fkey_and_found ? is_value_fkey_and_found.id : null,
      };
    }

    return {
      value: unwrapFeildValue(value_or_reference, type),
    };
  }

  export function safejson(data: any) {
    return JSON.parse(JSON.stringify(data));
  }
}
