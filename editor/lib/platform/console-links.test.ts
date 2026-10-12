import { describe, expect, it } from "vitest";
import { ConsoleLinks } from "./console-links";

describe("ConsoleLinks.aiGateway", () => {
  it("links to the organization's AI Gateway page", () => {
    expect(
      ConsoleLinks.aiGateway("acme", {
        GRIDA_PLATFORM_CONSOLE_ORIGIN: "https://console.example.com",
      })
    ).toBe("https://console.example.com/organizations/acme/ai-gateway");
  });

  it("uses the universal entry without a routable organization slug", () => {
    const env = {
      GRIDA_PLATFORM_CONSOLE_ORIGIN: "https://console.example.com",
    };
    expect(ConsoleLinks.aiGateway(undefined, env)).toBe(
      "https://console.example.com/_/ai-gateway"
    );
    expect(ConsoleLinks.aiGateway("Not A Slug", env)).toBe(
      "https://console.example.com/_/ai-gateway"
    );
  });

  it("falls back to the public Console when no valid origin is configured", () => {
    for (const env of [
      {},
      { GRIDA_PLATFORM_CONSOLE_ORIGIN: "" },
      { GRIDA_PLATFORM_CONSOLE_ORIGIN: "http://console.example.com" },
      { GRIDA_PLATFORM_CONSOLE_ORIGIN: "https://console.example.com/path" },
    ]) {
      expect(ConsoleLinks.aiGateway("acme", env)).toBe(
        "https://console.grida.co/organizations/acme/ai-gateway"
      );
    }
  });
});
