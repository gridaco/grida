import { unique } from "./unique";

describe("unique function", () => {
  it("should return unique values for primitive types", () => {
    expect(unique([1, 2, 2, 3, 3, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(unique(["a", "b", "b", "c", "a"])).toEqual(["a", "b", "c"]);
  });

  it("should return unique objects based on the given function", () => {
    const arr = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 1, name: "Alice" },
      { id: 3, name: "Charlie" },
    ];

    const result = unique(arr, (item) => item.id.toString());
    expect(result).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
    ]);
  });

  it("should return unique objects based on deep comparison", () => {
    const arr = [
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 1, name: "Alice" },
      { id: 3, name: "Charlie" },
      { id: 1, name: "Alice", age: 25 },
    ];

    const result = unique(arr, "deep");
    expect(result).toEqual([
      { id: 1, name: "Alice" },
      { id: 2, name: "Bob" },
      { id: 3, name: "Charlie" },
      { id: 1, name: "Alice", age: 25 },
    ]);
  });

  it("should work without a function parameter", () => {
    const arr = [1, 2, 3, 1, 2, 4];
    const result = unique(arr);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it("should handle an empty array", () => {
    const arr: any[] = [];
    const result = unique(arr);
    expect(result).toEqual([]);
  });

  it("should handle a single element array", () => {
    const arr = [1];
    const result = unique(arr);
    expect(result).toEqual([1]);
  });
});
