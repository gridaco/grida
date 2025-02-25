import { FormExpression } from "./expression";

describe("jsonref", () => {
  it("should compose a valid ref obj", () => {
    const ref = FormExpression.create_field_property_json_ref("<id>", "value");
    expect(ref).toEqual({
      $ref: "#/fields/<id>/value",
    });
  });
});
