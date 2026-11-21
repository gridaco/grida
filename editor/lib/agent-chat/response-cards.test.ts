import { describe, expect, it, vi } from "vitest";
import { ResponseCards } from "./response-cards";

const url = "http://localhost:3000/";

describe("ResponseCards.forReply", () => {
  it.each([
    [url, url],
    [`\`${url}\``, url],
    [`[Open preview](${url})`, url],
    [`http://localhost:3000 and ${url}`, url],
    [
      "The preview is at https://app.localhost:8443/demo.",
      "https://app.localhost:8443/demo",
    ],
    ["http://[::1]:9999/", "http://[::1]:9999/"],
    ["http://127.0.0.1:9999/", "http://127.0.0.1:9999/"],
    ["http://0.0.0.0:9999/", "http://0.0.0.0:9999/"],
  ])("offers a web preview for %s", (text, target) => {
    expect(ResponseCards.forReply({ text })).toEqual([
      {
        kind: "web-preview",
        action: { kind: "open-web", url: target, target: "default" },
      },
    ]);
  });

  it.each([
    "localhost:3000",
    "http://localhost/",
    "https://localhost:443/",
    "https://example.com:8443/",
    `${url} ${url}demo`,
    `[${url}](${url})`,
    "[http://localhost:3000](http://localhost:3000)",
    `${url}?name=(wide)`,
    "http://name:password@localhost:3000/",
  ])("skips %s", (text) => {
    expect(ResponseCards.forReply({ text })).toEqual([]);
  });

  it("caches results and misses for each immutable reply", () => {
    const parse = vi.spyOn(URL, "parse");
    try {
      const reply = { text: url };
      const miss = { text: "https://example.com:8443/" };
      const cards = ResponseCards.forReply(reply);
      const empty = ResponseCards.forReply(miss);
      expect(parse).toHaveBeenCalledTimes(2);

      expect(ResponseCards.forReply(reply)).toBe(cards);
      expect(ResponseCards.forReply(miss)).toBe(empty);
      expect(parse).toHaveBeenCalledTimes(2);

      const revised = { ...reply, text: `${url}updated` };
      expect(ResponseCards.forReply(revised)).toEqual([
        {
          kind: "web-preview",
          action: { kind: "open-web", url: `${url}updated`, target: "default" },
        },
      ]);
      expect(parse).toHaveBeenCalledTimes(3);
    } finally {
      parse.mockRestore();
    }
  });
});
