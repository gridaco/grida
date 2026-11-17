import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatActivityDate } from "./chat-activity-date";

describe("ChatActivityDate", () => {
  it("keeps a machine-readable instant and identifies the full time as activity", () => {
    const html = renderToStaticMarkup(
      <ChatActivityDate atMs={Date.parse("2026-11-17T03:04:00.000Z")} />
    );
    expect(html).toContain('dateTime="2026-11-17T03:04:00.000Z"');
    expect(html).toContain('title="Last activity: ');
    expect(html).toContain('aria-label="Last activity: ');
    expect(html).toContain("2026");
    expect(html).not.toContain("Archived");
  });

  it.each([undefined, NaN, Infinity, -1, 0.5, 8_640_000_000_000_001])(
    "omits an unavailable or invalid timestamp (%s)",
    (atMs) => {
      expect(renderToStaticMarkup(<ChatActivityDate atMs={atMs} />)).toBe("");
    }
  );
});
