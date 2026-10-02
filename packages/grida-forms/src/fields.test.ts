import { describe, expect, expectTypeOf, it } from "vitest";
import { FieldProperties, FieldSupports } from "./fields";
import { FormFieldAutocompleteTypes, FormInputTypes } from "./model";
import type { FormFieldAutocompleteType, FormInputType } from "./model";

describe("Forms field vocabulary", () => {
  it("exposes the same vocabulary to types and runtime consumers", () => {
    expectTypeOf<
      (typeof FormInputTypes)[number]
    >().toEqualTypeOf<FormInputType>();
    expectTypeOf<
      (typeof FormFieldAutocompleteTypes)[number]
    >().toEqualTypeOf<FormFieldAutocompleteType>();
  });

  it("treats media inputs as file aliases with their own accept defaults", () => {
    for (const type of ["file", "image", "audio", "video"] as const) {
      expect(FieldSupports.file_alias(type)).toBe(true);
      expect(FieldSupports.multiple(type)).toBe(true);
      expect(FieldSupports.autocomplete(type)).toBe(false);
      expect(FieldSupports.computedvalue({ type, readonly: true })).toBe(false);
    }
    expect(FieldProperties.accept("image")).toBe("image/*");
    expect(FieldProperties.accept("audio")).toBe("audio/*");
    expect(FieldProperties.accept("video")).toBe("video/*");
    expect(FieldProperties.accept("file")).toBeUndefined();
  });

  it("distinguishes rich content, choices and required hidden-field behavior", () => {
    expect(FieldSupports.file_alias("richtext")).toBe(false);
    expect(FieldSupports.file_upload("richtext")).toBe(true);
    expect(FieldSupports.jsonobject("richtext")).toBe(true);
    expect(FieldSupports.options("toggle-group")).toBe(true);
    expect(FieldSupports.multiple("toggle-group")).toBe(true);
    expect(FieldSupports.multiple("select")).toBe(false);
    expect(
      FieldSupports.computedvalue({ type: "hidden", required: true })
    ).toBe(false);
    expect(
      FieldSupports.computedvalue({ type: "hidden", required: false })
    ).toBe(true);
    expect(FieldSupports.computedvalue({ type: "text", readonly: true })).toBe(
      true
    );
  });
});
