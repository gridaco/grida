// TODO: move this file to form-specific directory.

import type {
  IFormField,
  FormResponse,
  FormResponseField,
} from "@/grida-forms-hosted/types";
import { unique } from "@/utils/unique";

export function process_response_provisional_info(
  responses: (Pick<FormResponse, "id" | "raw"> & {
    response_fields: (Partial<FormResponseField> & {
      form_field: Pick<IFormField, "name" | "type">;
      /**
       * Persisted verification state for `challenge_email` fields.
       * Stored on `grida_forms.response_field.challenge_state`.
       */
      challenge_state?: {
        state?: string;
        email?: string;
      } | null;
    })[];
  })[]
) {
  const provisional_email = [];
  const provisional_phone = [];

  for (const response of responses) {
    for (const field of response.response_fields) {
      if (field.form_field.type === "email") {
        provisional_email.push(response.raw[field.form_field.name]);
      } else if (field.form_field.type === "challenge_email") {
        // Only index verified emails to avoid poisoning provisional data.
        if (field.challenge_state?.state === "challenge-success") {
          provisional_email.push(response.raw[field.form_field.name]);
        }
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

export function provisional<T>(clear: T | null, provisional?: T[]): T[] {
  if (clear) {
    return [clear];
  }

  return provisional || [];
}
