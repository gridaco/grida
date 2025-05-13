import { factory } from "../src";

const token_test_property_access_expression =
  factory.createPropertyAccessExpression(["props", "a"]);

const toekn_test_template_expression = factory.createTemplateExpression([
  { kind: "StringLiteral", text: "Hi " },
  { kind: "Identifier", name: "name" },
]);

describe("getStringValueExpressionAccessIdentifiersDependencyArray", () => {
  it("should return property access expression", () => {
    const deps =
      factory.getStringValueExpressionAccessIdentifiersDependencyArray(
        token_test_property_access_expression
      );
    expect(deps).toEqual([["props", "a"]]);
  });

  it("should return template expression", () => {
    const deps =
      factory.getStringValueExpressionAccessIdentifiersDependencyArray(
        toekn_test_template_expression
      );
    expect(deps).toEqual([["name"]]);
  });
});
