import { describe, expect, it } from "vitest";
import { FXWorldStory } from "./fx-world-story";

describe("FXWorldStory.progress", () => {
  it("follows the current pinned geometry without previous scroll state", () => {
    expect(FXWorldStory.progress(300, 2340, 900)).toBe(0);
    expect(FXWorldStory.progress(0, 2340, 900)).toBe(0);
    expect(FXWorldStory.progress(-720, 2340, 900)).toBe(0.5);
    expect(FXWorldStory.progress(-1440, 2340, 900)).toBe(1);
    expect(FXWorldStory.progress(-4000, 2340, 900)).toBe(1);
    expect(FXWorldStory.progress(-720, 2400, 1200)).toBe(0.6);
  });

  it.each([
    [0, 0, 900],
    [0, 900, 900],
    [0, 600, 900],
    [0, 2340, 0],
    [Number.NaN, 2340, 900],
    [0, Number.POSITIVE_INFINITY, 900],
  ])("rejects unusable geometry (%s, %s, %s)", (top, track, viewport) => {
    expect(FXWorldStory.progress(top, track, viewport)).toBe(0);
  });
});

describe("FXWorldStory.evaluate", () => {
  it("begins with the source and ends with the assembled scene", () => {
    expect(FXWorldStory.evaluate(0)).toEqual({
      phase: "reference",
      breakout: 0,
      layersReveal: 0,
      scene: 0,
      referenceOpacity: 1,
      guideOpacity: 1,
      resultOpacity: 0,
    });
    expect(FXWorldStory.evaluate(1)).toEqual({
      phase: "playback",
      breakout: 0,
      layersReveal: 1,
      scene: 1,
      referenceOpacity: 0,
      guideOpacity: 0,
      resultOpacity: 1,
    });
  });

  it("holds the separated layers, then assembles them before revealing controls", () => {
    expect(FXWorldStory.evaluate(0.28).breakout).toBe(1);
    expect(FXWorldStory.evaluate(0.42).breakout).toBe(1);
    expect(FXWorldStory.evaluate(0.51).breakout).toBeCloseTo(0.5);
    expect(FXWorldStory.evaluate(0.6).breakout).toBe(0);
    expect(FXWorldStory.evaluate(0.78).scene).toBe(1);
    expect(FXWorldStory.evaluate(0.78).resultOpacity).toBe(0);
    expect(FXWorldStory.evaluate(0.86).resultOpacity).toBe(1);
  });

  it("reverses all composition values without retaining a previous position", () => {
    const positions = [0.02, 0.3, 0.65, 0.9];
    const forward = positions.map((position) =>
      FXWorldStory.evaluate(position)
    );
    const backward = [...positions]
      .reverse()
      .map((position) => FXWorldStory.evaluate(position));
    expect(forward.map((state) => state.phase)).toEqual([
      "reference",
      "layers",
      "assemble",
      "playback",
    ]);
    expect(backward).toEqual([...forward].reverse());
  });

  it("keeps all composition values finite and bounded across jumps and invalid input", () => {
    for (const position of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      -20,
      ...Array.from({ length: 101 }, (_, index) => index / 100),
      20,
      Number.POSITIVE_INFINITY,
    ]) {
      const { phase: _phase, ...values } = FXWorldStory.evaluate(position);
      for (const value of Object.values(values)) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
    expect(FXWorldStory.evaluate(Number.NaN)).toEqual(FXWorldStory.evaluate(0));
    expect(FXWorldStory.evaluate(Number.POSITIVE_INFINITY)).toEqual(
      FXWorldStory.evaluate(1)
    );
  });

  it("has no transform jumps at phase and composition boundaries", () => {
    for (const position of [
      0.1, 0.12, 0.24, 0.28, 0.35, 0.42, 0.5, 0.54, 0.56, 0.6, 0.68, 0.78, 0.86,
    ]) {
      const before = FXWorldStory.evaluate(position - 0.0001);
      const after = FXWorldStory.evaluate(position + 0.0001);
      for (const key of Object.keys(before) as Array<keyof typeof before>) {
        if (key === "phase") continue;
        expect(Math.abs(after[key] - before[key])).toBeLessThan(0.005);
      }
    }
  });
});

describe("FXWorldStory.evaluateMobile", () => {
  it("holds depth, smoothly assembles, then enables looping controls", () => {
    expect(FXWorldStory.evaluateMobile(0).breakout).toBe(1);
    expect(FXWorldStory.evaluateMobile(899).phase).toBe("layers");
    expect(FXWorldStory.evaluateMobile(900).breakout).toBe(1);
    expect(FXWorldStory.evaluateMobile(1800).breakout).toBeCloseTo(0.5);
    expect(FXWorldStory.evaluateMobile(1800).phase).toBe("assemble");
    expect(FXWorldStory.evaluateMobile(2699).phase).toBe("assemble");
    expect(FXWorldStory.evaluateMobile(2700)).toEqual({
      phase: "playback",
      breakout: 0,
      layersReveal: 1,
      scene: 1,
      referenceOpacity: 0,
      guideOpacity: 0,
      resultOpacity: 1,
    });
    expect(FXWorldStory.evaluateMobile(60000)).toEqual(
      FXWorldStory.evaluateMobile(2700)
    );
  });

  it("keeps the compact sequence smooth at the hold and loop boundaries", () => {
    for (const elapsed of [900, 2700]) {
      const before = FXWorldStory.evaluateMobile(elapsed - 0.1);
      const after = FXWorldStory.evaluateMobile(elapsed + 0.1);
      expect(Math.abs(after.breakout - before.breakout)).toBeLessThan(0.00001);
    }
    for (const elapsed of [NaN, Infinity, -1]) {
      expect(FXWorldStory.evaluateMobile(elapsed)).toEqual(
        FXWorldStory.evaluateMobile(0)
      );
    }
  });
});

describe("FXWorldStory.playbackPosition", () => {
  it("moves continuously at 27 pixels per second without wrapping the clock", () => {
    expect(FXWorldStory.playbackPosition(0)).toBe(0);
    expect(FXWorldStory.playbackPosition(500)).toBe(13.5);
    expect(FXWorldStory.playbackPosition(24000)).toBe(648);
    expect(FXWorldStory.playbackPosition(48000)).toBe(1296);
    expect(FXWorldStory.playbackPosition(86_400_000)).toBe(2_332_800);
  });

  it("maps accumulated active time identically after a pause and resume", () => {
    const beforePause = 12345;
    const afterResume = 3456;
    const distance = FXWorldStory.playbackPosition(beforePause + afterResume);
    expect(distance).toBeCloseTo(
      FXWorldStory.playbackPosition(beforePause) +
        FXWorldStory.playbackPosition(afterResume)
    );
    expect(FXWorldStory.playbackPosition(beforePause)).toBe(333.315);
  });

  it("returns the initial position for invalid or negative elapsed time", () => {
    for (const elapsed of [Number.NaN, Infinity, -Infinity, -1]) {
      expect(FXWorldStory.playbackPosition(elapsed)).toBe(0);
    }
  });
});

describe("FXWorldStory.advancePhase", () => {
  it("discards completed loops, including hours of autoplay", () => {
    for (const speed of [0.08, 0.22, 0.45, 0.75, 1]) {
      const phase = FXWorldStory.advancePhase(0, 86_400_000 * speed, 720);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
      expect(phase).toBeCloseTo(((86_400 * 27 * speed) % 720) / 720);
      // Reversing the page resizes the tile, without replaying old loops.
      expect(phase * 240).toBeCloseTo((phase * 720) / 3);
      expect(phase * 240).toBeLessThan(240);
    }
  });

  it("crosses a seam continuously and resumes from the same phase", () => {
    const before = FXWorldStory.advancePhase(0.999, 0, 720);
    const after = FXWorldStory.advancePhase(before, 80, 720);
    expect(after).toBeCloseTo(0.002);
    expect((after - before + 1) % 1).toBeCloseTo(2.16 / 720);
    expect(FXWorldStory.advancePhase(after, 0, 240)).toBe(after);
    expect(FXWorldStory.advancePhase(after, 500, 240)).toBeCloseTo(
      after + 13.5 / 240
    );
  });

  it("advances identically with small frames or a single large frame", () => {
    let phase = 0.25;
    for (let frame = 0; frame < 10000; frame++) {
      phase = FXWorldStory.advancePhase(phase, 16, 691.2);
    }
    expect(phase).toBeCloseTo(FXWorldStory.advancePhase(0.25, 160000, 691.2));
  });

  it("holds the phase when time or tile geometry is unusable", () => {
    for (const time of [NaN, Infinity, -Infinity, -1, 0]) {
      expect(FXWorldStory.advancePhase(0.4, time, 720)).toBe(0.4);
    }
    for (const width of [NaN, Infinity, -Infinity, -1, 0]) {
      expect(FXWorldStory.advancePhase(0.4, 1000, width)).toBe(0.4);
    }
  });
});

describe("FXWorldStory.panPhase", () => {
  it("drags in either direction through a wrap without resetting", () => {
    expect(FXWorldStory.panPhase(0.1, -144, 720)).toBeCloseTo(0.9);
    expect(FXWorldStory.panPhase(0.9, 144, 720)).toBeCloseTo(0.1);
    const phase = FXWorldStory.panPhase(0.1, -14400, 720);
    expect(phase).toBeCloseTo(0.1);
    expect(FXWorldStory.advancePhase(phase, 500, 720)).toBeCloseTo(0.11875);
  });

  it("moves the foreground with the hand and distant layers proportionally", () => {
    for (const speed of [0.08, 0.22, 0.45, 0.75, 1]) {
      const phase = FXWorldStory.panPhase(0.5, -120 * speed, 720);
      expect((phase - 0.5) * 720).toBeCloseTo(-120 * speed);
      expect(FXWorldStory.panPhase(phase, 120 * speed, 720)).toBeCloseTo(0.5);
    }
  });

  it("ignores invalid pointer distances and geometry", () => {
    for (const distance of [NaN, Infinity, -Infinity]) {
      expect(FXWorldStory.panPhase(0.5, distance, 720)).toBe(0.5);
    }
    expect(FXWorldStory.panPhase(0.5, 120, 0)).toBe(0.5);
  });
});
