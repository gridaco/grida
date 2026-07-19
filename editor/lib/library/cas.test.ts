import { describe, expect, it } from "vitest";
import { LibraryCAS } from "./cas";

describe("LibraryCAS", () => {
  // Cross-language contract vectors — the sibling-repo producer (Python,
  // hashlib) asserts these same pairs. If these move, the contract broke.
  it("sha256Hex matches the pinned cross-language vectors", () => {
    expect(LibraryCAS.sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
    expect(LibraryCAS.sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("pins image/jpeg to 'jpg' (mime-types would say 'jpeg')", () => {
    expect(LibraryCAS.ext("image/jpeg")).toBe("jpg");
    expect(LibraryCAS.ext("image/png")).toBe("png");
    expect(LibraryCAS.ext("image/svg+xml")).toBe("svg");
  });

  it("builds flat CAS paths", () => {
    const h = LibraryCAS.sha256Hex(new TextEncoder().encode("abc"));
    expect(LibraryCAS.path(h, "image/jpeg")).toBe(`${h}.jpg`);
    expect(LibraryCAS.path(h, "application/x-unknown-blob")).toBe(h);
    expect(LibraryCAS.path(h, "image/png")).not.toContain("/");
  });

  it("discriminates duplicate-upload errors across storage-api shapes", () => {
    expect(LibraryCAS.isDuplicateError({ statusCode: "409" })).toBe(true);
    expect(LibraryCAS.isDuplicateError({ status: 409 })).toBe(true);
    expect(LibraryCAS.isDuplicateError({ error: "Duplicate" })).toBe(true);
    expect(
      LibraryCAS.isDuplicateError({ message: "The resource already exists" })
    ).toBe(true);
    expect(
      LibraryCAS.isDuplicateError({ status: 400, message: "Payload too large" })
    ).toBe(false);
  });
});
