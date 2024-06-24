import { FormResponse, FormResponseField, IFormField } from "@/types";
import { unique } from "@/utils/unique";

export function process_response_provisional_info(
  responses: (Pick<FormResponse, "id" | "raw"> & {
    response_fields: (Partial<FormResponseField> & {
      form_field: Pick<IFormField, "name" | "type">;
    })[];
  })[]
) {
  const provisional_email = [];
  const provisional_phone = [];

  for (const response of responses) {
    for (const field of response.response_fields) {
      if (field.form_field.type === "email") {
        provisional_email.push(response.raw[field.form_field.name]);
      } else if (field.form_field.type === "tel") {
        provisional_phone.push(response.raw[field.form_field.name]);
      }
    }
  }

  return {
    email_provisional: unique(provisional_email),
    phone_provisional: unique(provisional_phone),
  };
}
