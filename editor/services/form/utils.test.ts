import { v4 } from "uuid";
import { FormValue } from "./utils";

const id_b = v4();
const id_d = v4();
const enums = [
  { id: v4(), value: "A" },
  { id: id_b, value: "B" },
  { id: v4(), value: "C" },
  { id: id_d, value: "D" },
];

describe("FormValue.parse", () => {
  it("should parse numeric field value", () => {
    const numeric = FormValue.parse(1, { type: "number" });
    expect(numeric).toEqual({ value: 1 });
    const numericstring = FormValue.parse("1", { type: "number" });
    expect(numericstring).toEqual({ value: 1 });
  });

  it("should parse boolean field value - switch", () => {
    const bool = FormValue.parse(true, { type: "switch" });
    expect(bool).toEqual({ value: true });
    const boolstring = FormValue.parse("on", { type: "switch" });
    expect(boolstring).toEqual({ value: true });
    const boolstringoff = FormValue.parse("off", { type: "switch" });
    expect(boolstringoff).toEqual({ value: false });
  });

  it("should parse boolean field value - checkbox", () => {
    const bool = FormValue.parse(true, { type: "checkbox" });
    expect(bool).toEqual({ value: true });
    const boolstring = FormValue.parse("on", { type: "checkbox" });
    expect(boolstring).toEqual({ value: true });
    const boolstringoff = FormValue.parse("off", { type: "checkbox" });
    expect(boolstringoff).toEqual({ value: false });
  });

  it("should parse enum value - select", () => {
    const parsed = FormValue.parse(id_b, {
      type: "select",
      enums: enums,
    });

    expect(parsed).toEqual({ value: "B", enum_id: id_b });
  });

  it("should parse enum value - toggle group [type=single]", () => {
    const valid = FormValue.parse(id_b, {
      type: "toggle-group",
      enums: enums,
      multiple: false,
    });

    expect(valid).toEqual({ value: "B", enum_id: id_b });
  });

  it("should NOT parse enum value - toggle group [type=single] but [value=array]", () => {
    const valid = FormValue.parse([id_b], {
      type: "toggle-group",
      enums: enums,
      multiple: false,
    });

    expect(valid.enum_id).toEqual(null);
    expect(valid.enum_ids).toEqual(undefined);
  });

  it("should parse enum value - toggle group [type=multiple]", () => {
    const one_selected_no_comma = FormValue.parse(`${id_b}`, {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(one_selected_no_comma).toEqual({ value: ["B"], enum_ids: [id_b] });

    const one_selected_with_comma = FormValue.parse(`${id_b},`, {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(one_selected_with_comma).toEqual({ value: ["B"], enum_ids: [id_b] });

    const two_selected = FormValue.parse(`${id_b},${id_d}`, {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(two_selected).toEqual({ value: ["B", "D"], enum_ids: [id_b, id_d] });
  });

  it("should parse enum value - toggle group [type=multiple] [value=array]", () => {
    const one_selected_no_comma = FormValue.parse([id_b], {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(one_selected_no_comma).toEqual({ value: ["B"], enum_ids: [id_b] });

    const two_selected = FormValue.parse([id_b, id_d], {
      type: "toggle-group",
      enums: enums,
      multiple: true,
    });

    expect(two_selected).toEqual({ value: ["B", "D"], enum_ids: [id_b, id_d] });
  });
});
