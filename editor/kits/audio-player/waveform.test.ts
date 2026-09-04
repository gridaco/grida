import { describe, expect, it } from "vitest";
import { AudioWaveform } from "./waveform";

describe("AudioWaveform.peaks", () => {
  it("reduces all channels into normalized peak buckets", () => {
    const left = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    const right = new Float32Array([0.8, 0.1, -0.6, 0.2]);

    const peaks = AudioWaveform.peaks([left, right], 2);
    expect(peaks[0]).toBe(1);
    expect(peaks[1]).toBeCloseTo(0.75);
  });

  it("preserves silence", () => {
    expect(AudioWaveform.peaks([new Float32Array(8)], 4)).toEqual([0, 0, 0, 0]);
  });

  it("supports an empty decoded buffer", () => {
    expect(AudioWaveform.peaks([], 3)).toEqual([0, 0, 0]);
  });

  it("rejects invalid bar counts", () => {
    expect(() => AudioWaveform.peaks([], 0)).toThrowError(RangeError);
    expect(() => AudioWaveform.peaks([], 1.5)).toThrowError(RangeError);
  });
});
