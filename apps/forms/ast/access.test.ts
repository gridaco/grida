import { Access } from "./access";

describe("resolvePath", () => {
  const context: Access.ScopedIdentifiersContext = {
    scopedIdentifiers: {
      identifier: ["b", "c"],
      nested: ["identifier", "d"],
      deep: ["nested", "e"],
    },
  };

  it("should resolve a path without context", () => {
    const path = ["a", "b", "c"];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual(["a", "b", "c"]);
  });

  it("should resolve a path with single level context", () => {
    const path = ["identifier", "d"];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual(["b", "c", "d"]);
  });

  it("should resolve a path with nested context", () => {
    const path = ["nested"];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual(["b", "c", "d"]);
  });

  it("should resolve a path with deep nested context", () => {
    const path = ["deep"];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual(["b", "c", "d", "e"]);
  });

  it("should handle mixed context and direct path", () => {
    const path = ["deep", "f"];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual(["b", "c", "d", "e", "f"]);
  });

  it("should return the original path if no context matches", () => {
    const path = ["x", "y", "z"];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual(["x", "y", "z"]);
  });

  it("should handle empty path", () => {
    const path: string[] = [];
    const resolvedPath = Access.resolvePath(path, context);
    expect(resolvedPath).toEqual([]);
  });
});

describe("access", () => {
  const obj = {
    a: 1,
    b: {
      c: {
        d: "hello",
        e: {
          f: {
            z: "z",
          },
        },
      },
    },
    g: "value",
  };

  const context: Access.ScopedIdentifiersContext = {
    scopedIdentifiers: {
      identifier: ["b", "c"],
      nested: ["identifier", "d"],
      doublenested: ["identifier", "e"],
      deep: ["doublenested", "f"],
    },
  };

  it("should access a value without context", () => {
    const path: Access.KeyPath<typeof obj> = ["b", "c", "d"];
    const result = Access.access(obj, path);
    expect(result).toBe("hello");
  });

  it("should access a value with single level context", () => {
    const path = ["identifier", "d"] as any;
    const result = Access.access(obj, path, context);
    expect(result).toBe("hello");
  });

  it("should access a value with nested context", () => {
    const path = ["nested"] as any;
    const result = Access.access(obj, path, context);
    expect(result).toBe("hello");
  });

  it("should access a value with deep nested context", () => {
    const path = ["deep", "z"] as any;
    const result = Access.access(obj, path, context);
    expect(result).toBe("z");
  });

  it("should return undefined for a path with no match", () => {
    const path = ["x", "y", "z"] as any;
    const result = Access.access(obj, path);
    expect(result).toBeUndefined();
  });

  it("should return undefined for an empty path", () => {
    const path: Access.KeyPath<typeof obj> = [] as any;
    const result = Access.access(obj, path);
    expect(result).toBeUndefined();
  });

  it("should access a value without context and with a direct path", () => {
    const path: Access.KeyPath<typeof obj> = ["g"];
    const result = Access.access(obj, path);
    expect(result).toBe("value");
  });
});

describe("select", () => {
  const obj = {
    a: 1,
    b: {
      c: {
        d: "hello",
        e: {
          f: {
            z: "z",
          },
        },
      },
    },
    g: "value",
  };

  const context: Access.ScopedIdentifiersContext = {
    scopedIdentifiers: {
      identifier: ["b", "c"],
      nested: ["identifier", "d"],
      doublenested: ["identifier", "e"],
      deep: ["doublenested", "f"],
    },
  };

  it("should select object value without context", () => {
    const paths: Access.KeyPath<typeof obj>[] = [["b", "c"]];
    const result = Access.select(obj, paths);
    expect(result).toEqual({
      b: {
        c: {
          d: "hello",
          e: {
            f: {
              z: "z",
            },
          },
        },
      },
    });
  });

  it("should select values without context", () => {
    const paths: Access.KeyPath<typeof obj>[] = [["b", "c", "d"]];
    const result = Access.select(obj, paths);
    expect(result).toEqual({ b: { c: { d: "hello" } } });
  });

  it("should select values with single level context", () => {
    const paths = [["identifier", "d"]] as any;
    const result = Access.select(obj, paths, context);
    expect(result).toEqual({ identifier: { d: "hello" } });
  });

  it("should select values with nested context", () => {
    const paths = [["nested"]] as any;
    const result = Access.select(obj, paths, context);
    expect(result).toEqual({ nested: "hello" });
  });

  it("should select values with deep nested context", () => {
    const paths = [["deep", "z"]] as any;
    const result = Access.select(obj, paths, context);
    expect(result).toEqual({ deep: { z: "z" } });
  });

  it("should handle mixed context and direct path", () => {
    const paths = [["deep", "z"]] as any;
    const result = Access.select(obj, paths, context);
    expect(result).toEqual({ deep: { z: "z" } });
  });

  it("should return an empty object for paths with no match", () => {
    const paths = [["x", "y", "z"]] as any;
    const result = Access.select(obj, paths);
    expect(result).toEqual({});
  });

  it("should handle an empty paths array", () => {
    const paths: Access.KeyPath<typeof obj>[] = [];
    const result = Access.select(obj, paths);
    expect(result).toEqual({});
  });

  it("should select multiple values correctly", () => {
    const paths: Access.KeyPath<typeof obj>[] = [["a"], ["b", "c", "d"], ["g"]];
    const result = Access.select(obj, paths);
    expect(result).toEqual({
      a: 1,
      b: {
        c: {
          d: "hello",
        },
      },
      g: "value",
    });
  });

  it("should select values using nested context and direct paths", () => {
    const paths = [["nested"], ["a"], ["deep", "z"]] as any;
    const result = Access.select(obj, paths, context);
    expect(result).toEqual({
      nested: "hello",
      a: 1,
      deep: {
        z: "z",
      },
    });
  });
});
