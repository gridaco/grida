import { describe, expect, it } from "vitest";
import { CurrentArtifactSurfaceHost } from "./current-artifact-surface-host";

describe("CurrentArtifactSurfaceHost", () => {
  it("reports its single already-visible artifact", () => {
    const host = new CurrentArtifactSurfaceHost("/deck.canvas");

    expect(host.listOpen()).toEqual({
      active: "/deck.canvas",
      open: ["/deck.canvas"],
    });
    expect(host.open("/deck.canvas")).toBeUndefined();
  });

  it("ignores a request for another artifact", () => {
    const host = new CurrentArtifactSurfaceHost("/canvas.svg");

    expect(host.open("/other.svg")).toBeUndefined();
    expect(host.listOpen()).toEqual({
      active: "/canvas.svg",
      open: ["/canvas.svg"],
    });
  });

  it("accepts the workspace root as a directly-opened bundle", () => {
    const host = new CurrentArtifactSurfaceHost("/");
    expect(host.listOpen()).toEqual({ active: "/", open: ["/"] });
  });
});
