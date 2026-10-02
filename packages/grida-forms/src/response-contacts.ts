/** Contact candidates recorded by responses, never proof of customer identity. */
export namespace FormResponseContacts {
  export interface Response {
    raw: Readonly<Record<string, unknown>> | null;
    response_fields: readonly {
      form_field: { name: string; type: string } | null;
      /** Persisted field verification state, supplied by the authorized host. */
      challenge_state?: unknown;
    }[];
  }

  export interface Provisional {
    email_provisional: string[];
    phone_provisional: string[];
  }

  /**
   * Collect unique string values in encounter order. Challenge email fields
   * contribute only after successful verification; ordinary email/tel fields
   * remain unverified candidates. This does not validate addresses or merge
   * customer records.
   */
  export function provisional(responses: readonly Response[]): Provisional {
    const emails = new Set<string>();
    const phones = new Set<string>();

    for (const response of responses) {
      for (const field of response.response_fields) {
        if (!field.form_field) continue;
        const value = response.raw?.[field.form_field.name];
        if (typeof value !== "string") continue;

        const challenge = field.challenge_state;
        const verified =
          challenge !== null &&
          typeof challenge === "object" &&
          "state" in challenge &&
          challenge.state === "challenge-success";

        if (
          field.form_field.type === "email" ||
          (field.form_field.type === "challenge_email" && verified)
        ) {
          emails.add(value);
        } else if (field.form_field.type === "tel") {
          phones.add(value);
        }
      }
    }

    return {
      email_provisional: [...emails],
      phone_provisional: [...phones],
    };
  }
}
