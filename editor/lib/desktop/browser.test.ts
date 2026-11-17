import { describe, expect, it } from "vitest";
import { Browser } from "./browser";

describe("Browser.address", () => {
  it("accepts explicit HTTP(S), localhost and ordinary hostname input", () => {
    expect(Browser.address(" https://example.com/docs ")).toBe(
      "https://example.com/docs"
    );
    expect(Browser.address("example.com:8443/path")).toBe(
      "https://example.com:8443/path"
    );
    expect(Browser.address("localhost:3000")).toBe("http://localhost:3000/");
    expect(Browser.address("127.0.0.1:8787/view")).toBe(
      "http://127.0.0.1:8787/view"
    );
    expect(Browser.address("[::1]:3000")).toBe("http://[::1]:3000/");
  });
  it("rejects privileged schemes, credentials and control characters", () => {
    for (const input of [
      "javascript:alert(1)",
      "file:///tmp/test",
      "grida-workspace://file",
      "https://user:password@example.com",
      "https://example.com/\nattack",
      "",
    ])
      expect(Browser.address(input)).toBeNull();
  });
});
