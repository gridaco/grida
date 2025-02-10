import { tokens } from "../tokens";

describe("tokens.render.any", () => {
  const context = {
    user: {
      name: "John Doe",
      address: {
        city: "New York",
        zip: "10001",
      },
    },
    theme: {
      colors: {
        primary: "#ff0000",
        secondary: "#00ff00",
      },
    },
  };

  it("should render a property access expression", () => {
    const propertyAccessExpression: tokens.PropertyAccessExpression = {
      kind: "PropertyAccessExpression",
      expression: ["user", "name"],
    };

    const result = tokens.render.any(propertyAccessExpression, context, false);
    expect(result).toBe("John Doe");
  });

  it("should render a template expression", () => {
    const templateExpression: tokens.TemplateExpression = {
      kind: "TemplateExpression",
      templateSpans: [
        { kind: "StringLiteral", text: "Hello, " },
        { kind: "PropertyAccessExpression", expression: ["user", "name"] },
        { kind: "StringLiteral", text: "! Welcome to " },
        {
          kind: "PropertyAccessExpression",
          expression: ["user", "address", "city"],
        },
        { kind: "StringLiteral", text: "." },
      ],
    };

    const result = tokens.render.any(templateExpression, context, false);
    expect(result).toBe("Hello, John Doe! Welcome to New York.");
  });

  it("should handle a primitive value", () => {
    expect(tokens.render.any("Hello, World!", context, false)).toBe(
      "Hello, World!"
    );
    expect(tokens.render.any(42, context, false)).toBe(42);
    expect(tokens.render.any(true, context, false)).toBe(true);
  });

  it("should handle recursive rendering for arrays", () => {
    const arrayValue = [
      { kind: "PropertyAccessExpression", expression: ["user", "name"] },
      "is from",
      {
        kind: "PropertyAccessExpression",
        expression: ["user", "address", "city"],
      },
    ];

    const result = tokens.render.any(arrayValue, context, true);
    expect(result).toEqual(["John Doe", "is from", "New York"]);
  });

  it("should handle recursive rendering for objects", () => {
    const objectValue = {
      name: { kind: "PropertyAccessExpression", expression: ["user", "name"] },
      city: {
        kind: "PropertyAccessExpression",
        expression: ["user", "address", "city"],
      },
    };

    const result = tokens.render.any(objectValue, context, true);
    expect(result).toEqual({
      name: "John Doe",
      city: "New York",
    });
  });

  it("should handle deeply nested recursive structures", () => {
    const nestedObject = {
      userInfo: {
        name: {
          kind: "PropertyAccessExpression",
          expression: ["user", "name"],
        },
        location: {
          city: {
            kind: "PropertyAccessExpression",
            expression: ["user", "address", "city"],
          },
        },
        static: "static",
      },
      themeColor: {
        kind: "PropertyAccessExpression",
        expression: ["theme", "colors", "primary"],
      },
    };

    const result = tokens.render.any(nestedObject, context, true);
    expect(result).toEqual({
      userInfo: {
        name: "John Doe",
        location: {
          city: "New York",
        },
        static: "static",
      },
      themeColor: "#ff0000",
    });
  });

  it("should return the value as is if not a recognized token type and recursive is false", () => {
    const unknownValue = { random: "data" };
    const result = tokens.render.any(unknownValue, context, false);
    expect(result).toEqual(unknownValue);
  });

  it("should handle unknown token types gracefully", () => {
    const unknownToken = { kind: "UnknownToken" } as any;
    const result = tokens.render.any(unknownToken, context, false);
    expect(result).toEqual(unknownToken);
  });

  it("should handle null and undefined gracefully", () => {
    expect(tokens.render.any(null, context, false)).toBe(null);
    expect(tokens.render.any(undefined, context, false)).toBe(undefined);
  });
});
