import { FieldSupports } from "@/k/supported_field_types";
import { FormInputType } from "@/types";

export namespace XSupabaseFieldConnectionPolicyCheck {
  export function required_object_path_policy_for({
    type,
    multiple,
  }: {
    type: FormInputType;
    multiple: boolean;
  }):
    | "x-supabase-storage-compile-time-renderable-single-file-path-template"
    | undefined {
    if (multiple)
      return "x-supabase-storage-compile-time-renderable-single-file-path-template";

    if (FieldSupports.richtext(type))
      return "x-supabase-storage-compile-time-renderable-single-file-path-template";

    return undefined;
  }

  export function required_bucket_policy_for({
    type,
  }: {
    type: FormInputType;
  }): "public" | "private" | "any" {
    if (FieldSupports.richtext(type)) return "public";

    return "any";
  }
}
