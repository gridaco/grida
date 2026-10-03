import { describe, expect, it } from "vitest";
import { TemplateVariables, render } from "./templating";

describe("templating/render", () => {
  it("resolves nested context values and escapes HTML by default", () => {
    const context = TemplateVariables.createContext(
      "x-supabase.postgrest_query_select",
      { TABLE: { pks: ["id"] }, RECORD: { name: "<Ada & Grace>" } }
    );
    expect(render("Hello {{RECORD.name}}", context)).toBe(
      "Hello &lt;Ada &amp; Grace&gt;"
    );
    expect(render("{{RECORD.name}}", context, { noEscape: true })).toBe(
      "<Ada & Grace>"
    );
  });

  it("preserves Handlebars missing-value, block and strict-mode semantics", () => {
    const context = TemplateVariables.createContext("form", {
      form_title: "Registration",
    });
    expect(
      render("{{missing}}/{{#if form_title}}{{form_title}}{{/if}}", context)
    ).toBe("/Registration");
    expect(() => render("{{missing}}", context, { strict: true })).toThrow(
      /missing/
    );
  });

  it("generates an independent UUID for each helper invocation and render", () => {
    const first = render("{{uuid}}/{{uuid}}", {});
    const second = render("{{uuid}}", {});
    const ids = [...first.split("/"), second];
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    }
    expect(new Set(ids).size).toBe(3);
  });
});

describe("TemplateVariables", () => {
  it("describes current-file metadata without requiring a File instance", () => {
    const context = TemplateVariables.createContext("current_file", {
      file: {
        name: "receipt.pdf",
        size: 123,
        type: "application/pdf",
        lastModified: 0,
      },
    });
    expect(TemplateVariables.schemas.current_file.parse(context)).toEqual(
      context
    );
    expect(context).not.toHaveProperty("uuid");
    expect(
      TemplateVariables.schemas.current_file.safeParse({
        file: { name: "missing-metadata" },
      }).success
    ).toBe(false);
  });
});
