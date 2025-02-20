// assign.test.ts
import { deepAssign } from "./assign";

describe("deepAssign", () => {
  it("should deeply assign properties from source to target", () => {
    const target = {
      a: 1,
      b: { x: 10, y: 20 },
      c: { nested: { value: "unchanged" } },
    };

    const source = {
      b: { y: 30, z: 40 },
      c: { nested: { value: "changed" } },
    };

    deepAssign(target, source);

    expect(target).toEqual({
      a: 1,
      b: { x: 10, y: 30, z: 40 },
      c: { nested: { value: "changed" } },
    });
  });

  it("should add new properties to target from source", () => {
    const target = { a: 1 };
    const source = { b: { x: 10 } };

    deepAssign(target, source);

    expect(target).toEqual({
      a: 1,
      b: { x: 10 },
    });
  });

  it("should overwrite primitive values in target with source values", () => {
    const target = { a: 1, b: 2 };
    const source = { b: 3 };

    deepAssign(target, source);

    expect(target).toEqual({
      a: 1,
      b: 3,
    });
  });

  it("should handle empty source object without modifying target", () => {
    const target = { a: 1, b: { x: 10 } };
    const source = {};

    deepAssign(target, source);

    expect(target).toEqual({
      a: 1,
      b: { x: 10 },
    });
  });

  it("should handle empty target object by copying all properties from source", () => {
    const target = {};
    const source = { a: 1, b: { x: 10 } };

    deepAssign(target, source);

    expect(target).toEqual({
      a: 1,
      b: { x: 10 },
    });
  });
});
