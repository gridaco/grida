import {
  matchUniversalRoute,
  normalizeUniversalPath,
  universalRoutes,
} from "@/host/url";

describe("universal docs routing", () => {
  it("matches each sample path uniquely", () => {
    for (const route of universalRoutes) {
      const matches = matchUniversalRoute(route.samplePath);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.id).toBe(route.id);
    }
  });

  it("normalizes paths consistently", () => {
    expect(normalizeUniversalPath("/connect/share/")).toBe("connect/share");
    expect(normalizeUniversalPath("///dash")).toBe("dash");
    expect(normalizeUniversalPath("ciam")).toBe("ciam");
    expect(normalizeUniversalPath("/")).toBe("");
  });

  it("returns no matches for unknown paths", () => {
    expect(matchUniversalRoute("unknown")).toHaveLength(0);
  });

  it("matches project root for empty path", () => {
    const matches = matchUniversalRoute("");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("project");
  });
});
