import { describe, expect, it } from "vitest";
import { FieldSupports, FormValue } from "./index";

const alpha = "00000000-0000-4000-8000-000000000001";
const beta = "00000000-0000-4000-8000-000000000002";
const gamma = "00000000-0000-4000-8000-000000000003";
const options = [
  { id: alpha, value: "Alpha" },
  { id: beta, value: "Beta" },
  { id: gamma, value: "Gamma" },
];

describe("FormValue.submissionCardinality", () => {
  it.each([undefined, null, false, true])(
    "checkboxes are plural independently of multiple=%s",
    (multiple) => {
      expect(
        FormValue.submissionCardinality({ type: "checkboxes", multiple })
      ).toBe("plural");
      expect(FieldSupports.multiple("checkboxes")).toBe(false);
    }
  );

  it.each([undefined, null, false])(
    "toggle groups remain scalar with multiple=%s",
    (multiple) => {
      expect(
        FormValue.submissionCardinality({ type: "toggle-group", multiple })
      ).toBe("scalar");
    }
  );

  it("only enabled toggle groups have plural selection semantics", () => {
    expect(
      FormValue.submissionCardinality({ type: "toggle-group", multiple: true })
    ).toBe("plural");
  });

  it.each(["select", "email", "checkbox", "text", undefined] as const)(
    "%s does not gain plural submission semantics from multiple alone",
    (type) => {
      expect(FormValue.submissionCardinality({ type, multiple: true })).toBe(
        "scalar"
      );
    }
  );
});

describe("FormValue.parseEntries", () => {
  it.each([undefined, null, false, true])(
    "preserves repeated checkbox literals with multiple=%s, including commas and UUID-looking values",
    (multiple) => {
      const result = FormValue.parseEntries(["north,south", beta], {
        type: "checkboxes",
        multiple,
        enums: [
          { id: alpha, value: "north,south" },
          { id: beta, value: "must not replace the literal" },
          { id: gamma, value: beta },
        ],
      });
      expect(result).toEqual({
        ok: true,
        raw: ["north,south", beta],
        parsed: { value: ["north,south", beta], enum_ids: [alpha, gamma] },
        option_ids: [alpha, gamma],
      });
    }
  );

  it("reports every identity matching a checkbox literal without duplicating identities", () => {
    expect(
      FormValue.parseEntries(["same", "same", "unknown"], {
        type: "checkboxes",
        enums: [
          { id: alpha, value: "same" },
          { id: beta, value: "same" },
        ],
      })
    ).toEqual({
      ok: true,
      raw: ["same", "same", "unknown"],
      parsed: { value: ["same", "same", "unknown"], enum_ids: [alpha, beta] },
      option_ids: [alpha, beta],
    });
  });

  it.each([
    [alpha, beta, gamma],
    [`${alpha},${beta},${gamma}`],
    [alpha, `${beta},${gamma}`],
  ])(
    "normalizes repeated and packed multi-toggle references: %j",
    (...entries) => {
      expect(
        FormValue.parseEntries(entries, {
          type: "toggle-group",
          multiple: true,
          enums: options,
        })
      ).toEqual({
        ok: true,
        raw: [alpha, beta, gamma],
        parsed: {
          value: ["Alpha", "Beta", "Gamma"],
          enum_ids: [alpha, beta, gamma],
        },
        option_ids: [alpha, beta, gamma],
      });
    }
  );

  it("preserves toggle resolution for unknown references, empty packed tokens and repeated identities", () => {
    expect(
      FormValue.parseEntries([`${beta},`, "unknown", beta], {
        type: "toggle-group",
        multiple: true,
        enums: options,
      })
    ).toEqual({
      ok: true,
      raw: [beta, "", "unknown", beta],
      parsed: { value: ["Beta", "Beta"], enum_ids: [beta, beta] },
      option_ids: [beta],
    });
  });

  it.each(["text", "email", "select", "toggle-group", undefined] as const)(
    "rejects conflicting scalar %s entries before conversion",
    (type) => {
      expect(
        FormValue.parseEntries([alpha, beta], {
          type,
          multiple: type === "toggle-group" ? false : true,
          enums: options,
        })
      ).toEqual({ ok: false, error: "ambiguous-scalar" });
    }
  );

  it("collapses identical scalar entries and resolves the same single option", () => {
    expect(
      FormValue.parseEntries([beta, beta], {
        type: "select",
        multiple: true,
        enums: options,
      })
    ).toEqual({
      ok: true,
      raw: beta,
      parsed: { value: "Beta", enum_id: beta },
      option_ids: [beta],
    });
  });

  it.each(["email", "select"] as const)(
    "does not unpack comma-separated scalar %s values",
    (type) => {
      const raw =
        type === "email"
          ? "one@example.com,two@example.com"
          : `${alpha},${beta}`;
      const result = FormValue.parseEntries([raw], {
        type,
        multiple: true,
        enums: options,
      });
      expect(result).toEqual({
        ok: true,
        raw,
        parsed:
          type === "select" ? { value: raw, enum_id: null } : { value: raw },
        option_ids: [],
      });
    }
  );

  it.each([false, 0, "", undefined, null, NaN])(
    "retains identical falsy unknown-field values: %s",
    (value) => {
      expect(
        FormValue.parseEntries([value, value], { type: undefined })
      ).toEqual({
        ok: true,
        raw: value,
        parsed: { value },
        option_ids: [],
      });
    }
  );

  it("keeps absent scalar and plural values distinct", () => {
    expect(FormValue.parseEntries([], { type: "text" })).toEqual({
      ok: true,
      raw: null,
      parsed: { value: null },
      option_ids: [],
    });
    for (const type of ["checkboxes", "toggle-group"] as const) {
      expect(FormValue.parseEntries([], { type, multiple: true })).toEqual({
        ok: true,
        raw: [],
        parsed: { value: [], enum_ids: [] },
        option_ids: [],
      });
    }
  });

  it("retains existing scalar conversions and their failures", () => {
    expect(FormValue.parseEntries(["42"], { type: "number" })).toEqual({
      ok: true,
      raw: "42",
      parsed: { value: 42 },
      option_ids: [],
    });
    expect(FormValue.parseEntries(["on"], { type: "checkbox" })).toEqual({
      ok: true,
      raw: "on",
      parsed: { value: true },
      option_ids: [],
    });
    expect(() => FormValue.parseEntries(["{"], { type: "richtext" })).toThrow(
      SyntaxError
    );
  });

  it.each(["file", "image", "audio", "video"] as const)(
    "preserves every %s entry for file transport independently of the multiple flag",
    (type) => {
      const file = new File(["bytes"], "example.txt");
      const entries = Object.freeze([file, "staged/a,staged/b", file]);
      const result = FormValue.parseEntries(entries, { type, multiple: false });
      expect(result).toEqual({
        ok: true,
        raw: entries,
        parsed: { value: entries },
        option_ids: [],
      });
      if (!result.ok) throw new Error("Expected preserved file transport");
      expect(result.raw).not.toBe(entries);
      expect((result.raw as unknown[])[0]).toBe(file);
      expect(entries).toEqual([file, "staged/a,staged/b", file]);
    }
  );
});
