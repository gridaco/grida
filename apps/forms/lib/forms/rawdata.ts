import type { FormFieldDefinition } from "@/types";

export namespace RawdataProcessing {
  export function idkeytonamekey(
    data: Record<string, any>,
    fields: Pick<FormFieldDefinition, "id" | "name">[]
  ) {
    const result: Record<string, any> = {};
    for (const key in data) {
      const field = fields.find((f) => f.id === key);
      if (field) {
        result[field.name] = data[key];
      }
    }
    return result;
  }

  export function namekeytoidkey(
    data: Record<string, any>,
    fields: Pick<FormFieldDefinition, "id" | "name">[]
  ) {
    const result: Record<string, any> = {};
    for (const key in data) {
      const field = fields.find((f) => f.name === key);
      if (field) {
        result[field.id] = data[key];
      }
    }
    return result;
  }
}
