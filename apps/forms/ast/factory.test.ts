import { Factory } from "./factory";

const token_test_property_access_expression =
  Factory.createPropertyAccessExpression(["props", "a"]);

const toekn_test_template_expression = Factory.createTemplateExpression([
  { kind: "StringLiteral", text: "Hi " },
  { kind: "Identifier", name: "name" },
]);

describe("getStringValueExpressionAccessIdentifiersDependencyArray", () => {
  it("should return property access expression", () => {
    const deps =
      Factory.getStringValueExpressionAccessIdentifiersDependencyArray(
        token_test_property_access_expression
      );
    expect(deps).toEqual([["props", "a"]]);
  });

  it("should return template expression", () => {
    const deps =
      Factory.getStringValueExpressionAccessIdentifiersDependencyArray(
        toekn_test_template_expression
      );
    expect(deps).toEqual([["name"]]);
  });
});
