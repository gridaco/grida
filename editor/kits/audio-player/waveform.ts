/** Browser-native waveform extraction for complete audio sources. */
export namespace AudioWaveform {
  export const DEFAULT_BAR_COUNT = 112;

  export async function decode(
    source: string | Blob,
    barCount = DEFAULT_BAR_COUNT,
    signal?: AbortSignal
  ): Promise<number[]> {
    const encoded = await readSource(source, signal);
    if (signal?.aborted) throw abortError();

    const context = new OfflineAudioContext(1, 1, 44_100);
    const decoded = await context.decodeAudioData(encoded);
    if (signal?.aborted) throw abortError();

    const channels = Array.from(
      { length: decoded.numberOfChannels },
      (_, channel) => decoded.getChannelData(channel)
    );
    return peaks(channels, barCount);
  }

  export function peaks(
    channels: readonly Float32Array[],
    barCount = DEFAULT_BAR_COUNT
  ): number[] {
    if (!Number.isInteger(barCount) || barCount <= 0) {
      throw new RangeError("Waveform bar count must be a positive integer.");
    }

    const sampleCount = channels.reduce(
      (largest, channel) => Math.max(largest, channel.length),
      0
    );
    if (sampleCount === 0) return Array<number>(barCount).fill(0);

    const values = Array.from({ length: barCount }, (_, bar) => {
      const start = Math.floor((bar * sampleCount) / barCount);
      const end = Math.max(
        start + 1,
        Math.floor(((bar + 1) * sampleCount) / barCount)
      );
      let peak = 0;
      for (const channel of channels) {
        const channelEnd = Math.min(end, channel.length);
        for (let sample = start; sample < channelEnd; sample++) {
          peak = Math.max(peak, Math.abs(channel[sample] ?? 0));
        }
      }
      return peak;
    });

    const loudest = Math.max(...values);
    return loudest > 0 ? values.map((value) => value / loudest) : values;
  }
}

async function readSource(
  source: string | Blob,
  signal?: AbortSignal
): Promise<ArrayBuffer> {
  if (typeof source !== "string") return await source.arrayBuffer();

  const response = await fetch(source, { signal });
  if (!response.ok) {
    throw new Error(`Could not load audio source (${response.status}).`);
  }
  return await response.arrayBuffer();
}

function abortError(): DOMException {
  return new DOMException("Waveform decoding was cancelled.", "AbortError");
}
