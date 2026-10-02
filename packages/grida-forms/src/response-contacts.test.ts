import { describe, expect, it } from "vitest";
import { FormResponseContacts } from "./response-contacts";

describe("FormResponseContacts.provisional", () => {
  it("collects ordinary contact candidates and only verified challenge emails", () => {
    expect(
      FormResponseContacts.provisional([
        {
          raw: {
            email: "candidate@example.com",
            verified: "verified@example.com",
            pending: "pending@example.com",
            failed: "failed@example.com",
            phone: "+821012345678",
            note: "not-a-contact@example.com",
          },
          response_fields: [
            { form_field: { name: "email", type: "email" } },
            {
              form_field: { name: "verified", type: "challenge_email" },
              challenge_state: {
                state: "challenge-success",
                email: "verified@example.com",
              },
            },
            {
              form_field: { name: "pending", type: "challenge_email" },
              challenge_state: { state: "challenge-session-started" },
            },
            {
              form_field: { name: "failed", type: "challenge_email" },
              challenge_state: { state: "challenge-failed" },
            },
            { form_field: { name: "phone", type: "tel" } },
            { form_field: { name: "note", type: "text" } },
          ],
        },
      ])
    ).toEqual({
      email_provisional: ["candidate@example.com", "verified@example.com"],
      phone_provisional: ["+821012345678"],
    });
  });

  it("never treats submitted raw challenge metadata as verification", () => {
    for (const challenge_state of [
      undefined,
      null,
      "challenge-success",
      { state: "idle" },
      { state: "challenge-expired" },
      { state: "error" },
    ]) {
      expect(
        FormResponseContacts.provisional([
          {
            raw: {
              email: "candidate@example.com",
              __challenge_email__: { state: "challenge-success" },
            },
            response_fields: [
              {
                form_field: { name: "email", type: "challenge_email" },
                challenge_state,
              },
            ],
          },
        ])
      ).toEqual({ email_provisional: [], phone_provisional: [] });
    }
  });

  it("deduplicates across responses in encounter order without normalizing values", () => {
    const response = (email: string, phone: string) => ({
      raw: { email, phone },
      response_fields: [
        { form_field: { name: "email", type: "email" } },
        { form_field: { name: "phone", type: "tel" } },
      ],
    });
    expect(
      FormResponseContacts.provisional([
        response("first@example.com", "010-1234-5678"),
        response("second@example.com", "010-1234-5678"),
        response("first@example.com", "+821012345678"),
      ])
    ).toEqual({
      email_provisional: ["first@example.com", "second@example.com"],
      phone_provisional: ["010-1234-5678", "+821012345678"],
    });
  });

  it("ignores absent fields, missing raw data and non-string values", () => {
    expect(
      FormResponseContacts.provisional([
        {
          raw: null,
          response_fields: [{ form_field: { name: "email", type: "email" } }],
        },
        {
          raw: { email: ["array@example.com"], phone: 123, object: {} },
          response_fields: [
            { form_field: null },
            { form_field: { name: "email", type: "email" } },
            { form_field: { name: "phone", type: "tel" } },
            { form_field: { name: "object", type: "email" } },
            { form_field: { name: "missing", type: "email" } },
          ],
        },
      ])
    ).toEqual({ email_provisional: [], phone_provisional: [] });
  });
});
