import { describe, expect, test } from "vitest";
import { FlatPostgREST } from "./flat";

describe("FlatPostgREST", () => {
  test("keeps column identity separate from the nested JSON path", () => {
    const path = FlatPostgREST.encodePath("profile", "address", "city");
    expect(path).toBe("profile.$.address.city");
    expect(FlatPostgREST.testPath(path)).toBe(true);
    expect(FlatPostgREST.decodePath(path)).toEqual({
      column: "profile",
      path: "address.city",
    });
    expect(FlatPostgREST.testPath("profile.address.city")).toBe(false);
    expect(() => FlatPostgREST.decodePath("profile.$.")).toThrow(
      "Invalid JSON path"
    );
  });

  test("unflattens only the selected column and transforms values", () => {
    expect(
      FlatPostgREST.unflatten(
        {
          "profile.$.address.city": "Seoul",
          "profile.$.age": "42",
          "other.$.age": "ignored",
          title: "not JSON",
        },
        undefined,
        {
          key: (key) => key.startsWith("profile.$."),
          value: (key, value) => (key.endsWith(".age") ? Number(value) : value),
        }
      )
    ).toEqual({ address: { city: "Seoul" }, age: 42 });
  });

  test("reads and updates nested fields without changing the original row", () => {
    const row = { profile: { name: "Before", location: { city: "Seoul" } } };
    expect(FlatPostgREST.get("profile.$.location.city", row)).toBe("Seoul");
    expect(FlatPostgREST.get("missing.$.value", row)).toBeUndefined();
    const updated = FlatPostgREST.update<unknown>(
      row,
      "profile.$.name",
      "After"
    );
    expect(updated).toEqual({
      profile: { name: "After", location: { city: "Seoul" } },
    });
    expect(row.profile.name).toBe("Before");
  });
});
