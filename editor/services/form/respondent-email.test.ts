import { describe, expect, test } from "vitest";
import { renderRespondentEmail, stringifyFields } from "./respondent-email";

describe("respondent-email", () => {
  test("stringifyFields JSON-stringifies non-primitive values", () => {
    const fields = stringifyFields({
      ok: true,
      n: 1,
      obj: { a: 1 },
      arr: [1, 2],
    });

    expect(fields.ok).toBe("true");
    expect(fields.n).toBe("1");
    expect(fields.obj).toBe(JSON.stringify({ a: 1 }));
    expect(fields.arr).toBe(JSON.stringify([1, 2]));
  });

  test("renderRespondentEmail renders handlebars variables", () => {
    const { subject, html } = renderRespondentEmail({
      form_title: "MyForm",
      raw: { first_name: "Ada" },
      response_local_index: 12,
      response_local_id: "abc",
      subject_template: "Hello {{fields.first_name}}",
      body_html_template: "<p>{{form_title}} {{response.idx}}</p>",
    });

    expect(subject).toBe("Hello Ada");
    expect(html).toBe("<p>MyForm #012</p>");
  });
});
