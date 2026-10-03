import { describe, expect, it } from "vitest";
import { FormsApiPaths } from "./index";

describe("FormsApiPaths", () => {
  it("places the complete Forms operation inventory under the product namespace", () => {
    expect({
      prefix: FormsApiPaths.prefix,
      form: FormsApiPaths.form("form-id"),
      session: FormsApiPaths.session("form-id"),
      submit: FormsApiPaths.submit("form-id"),
      field: FormsApiPaths.field("session-id", "field-id"),
      fieldSearchMeta: FormsApiPaths.fieldSearchMeta("session-id", "field-id"),
      fieldUploadSignedUrl: FormsApiPaths.fieldUploadSignedUrl(
        "session-id",
        "field-id"
      ),
      fieldPreviewPublicUrl: FormsApiPaths.fieldPreviewPublicUrl(
        "session-id",
        "field-id"
      ),
      emailChallengeStart: FormsApiPaths.emailChallengeStart(
        "session-id",
        "field-id"
      ),
      emailChallengeVerify: FormsApiPaths.emailChallengeVerify(
        "session-id",
        "field-id"
      ),
      emailChallengeState: FormsApiPaths.emailChallengeState(
        "session-id",
        "field-id"
      ),
    }).toEqual({
      prefix: "/v1/forms",
      form: "/v1/forms/form-id",
      session: "/v1/forms/form-id/session",
      submit: "/v1/forms/submit/form-id",
      field: "/v1/forms/session/session-id/field/field-id",
      fieldSearchMeta:
        "/v1/forms/session/session-id/field/field-id/search/meta",
      fieldUploadSignedUrl:
        "/v1/forms/session/session-id/field/field-id/file/upload/signed-url",
      fieldPreviewPublicUrl:
        "/v1/forms/session/session-id/field/field-id/file/preview/public-url",
      emailChallengeStart:
        "/v1/forms/session/session-id/field/field-id/challenge/email/start",
      emailChallengeVerify:
        "/v1/forms/session/session-id/field/field-id/challenge/email/verify",
      emailChallengeState:
        "/v1/forms/session/session-id/field/field-id/challenge/email/state",
    });
  });

  it("encodes raw identifiers once without creating paths, queries or fragments", () => {
    const value = "part /?#%\\雪";
    expect(FormsApiPaths.form(value)).toBe(
      "/v1/forms/part%20%2F%3F%23%25%5C%E9%9B%AA"
    );
    expect(FormsApiPaths.session(value)).toBe(
      "/v1/forms/part%20%2F%3F%23%25%5C%E9%9B%AA/session"
    );
    expect(FormsApiPaths.submit(value)).toBe(
      "/v1/forms/submit/part%20%2F%3F%23%25%5C%E9%9B%AA"
    );
    expect(FormsApiPaths.field(value, "%2F")).toBe(
      "/v1/forms/session/part%20%2F%3F%23%25%5C%E9%9B%AA/field/%252F"
    );
    expect(FormsApiPaths.field("%2e%2e", value)).toBe(
      "/v1/forms/session/%252e%252e/field/part%20%2F%3F%23%25%5C%E9%9B%AA"
    );

    const path = FormsApiPaths.emailChallengeVerify(value, "../other");
    const url = new URL(path, "https://api.example.test");
    expect(url.origin).toBe("https://api.example.test");
    expect(url.pathname).toBe(path);
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  const fieldPaths = [
    FormsApiPaths.field,
    FormsApiPaths.fieldSearchMeta,
    FormsApiPaths.fieldUploadSignedUrl,
    FormsApiPaths.fieldPreviewPublicUrl,
    FormsApiPaths.emailChallengeStart,
    FormsApiPaths.emailChallengeVerify,
    FormsApiPaths.emailChallengeState,
  ];

  it.each(["", ".", ".."])(
    "rejects the empty or URL-normalized identifier %j in every position",
    (value) => {
      for (const path of [
        FormsApiPaths.form,
        FormsApiPaths.session,
        FormsApiPaths.submit,
      ]) {
        expect(() => path(value)).toThrow(TypeError);
      }
      for (const path of fieldPaths) {
        expect(() => path(value, "field-id")).toThrow(TypeError);
        expect(() => path("session-id", value)).toThrow(TypeError);
      }
    }
  );

  it("matches namespace boundaries without admitting neighboring products or decoding aliases", () => {
    for (const pathname of [
      "/v1/forms",
      "/v1/forms/",
      "/v1/forms/form-id",
      "/v1/forms/unknown-operation",
      "/v1/forms/session/s/field/f",
    ]) {
      expect(FormsApiPaths.isPath(pathname)).toBe(true);
    }
    for (const pathname of [
      "",
      "/",
      "/v1",
      "/v1/forms-other",
      "/v1/forms2/form-id",
      "/v1/Forms/form-id",
      "/v1/%66orms/form-id",
      "/v1/forms%2Fform-id",
      "/v1/session/s/field/f",
      "/v1/submit/form-id",
      "/v1/account",
      "/v2/forms/form-id",
      "v1/forms/form-id",
      "https://api.example.test/v1/forms/form-id",
    ]) {
      expect(FormsApiPaths.isPath(pathname)).toBe(false);
    }
  });
});
