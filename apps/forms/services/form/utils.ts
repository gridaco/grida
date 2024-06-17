import { is_uuid_v4 } from "@/utils/is";
import type { Option } from "@/types";

export namespace FormServiceUtils {
  export function parseValue(value_or_reference: any, enums: Option[]) {
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

  export function safejson(data: any) {
    return JSON.parse(JSON.stringify(data));
  }
}
