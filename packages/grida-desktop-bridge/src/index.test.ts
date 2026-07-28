// GRIDA-SEC-008 — ChatGPT connect exposes only status or cancellation.
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ChatGptConnectResult, DesktopBridge } from "./index";

describe("DesktopBridge ChatGPT connect result", () => {
  it("preserves status on success and exposes cancellation as a closed outcome", () => {
    type Connect = NonNullable<DesktopBridge["chatgpt"]>["connect"];
    expectTypeOf<
      Awaited<ReturnType<Connect>>
    >().toEqualTypeOf<ChatGptConnectResult>();

    const connected = {
      configured: true,
      signed_in: true,
      ready: true,
      signing_in: false,
    } satisfies ChatGptConnectResult;
    const cancelled = {
      outcome: "cancelled",
    } satisfies ChatGptConnectResult;

    expect(classify(connected)).toBe("connected");
    expect(classify(cancelled)).toBe("cancelled");
    expect(connected).toEqual({
      configured: true,
      signed_in: true,
      ready: true,
      signing_in: false,
    });
  });
});

function classify(result: ChatGptConnectResult): "connected" | "cancelled" {
  if (result.outcome === "cancelled") return "cancelled";
  expectTypeOf(result.ready).toEqualTypeOf<boolean>();
  return "connected";
}
