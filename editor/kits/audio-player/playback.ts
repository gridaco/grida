/** State decisions shared by the audio player's media controls. */
export namespace AudioPlayback {
  export function shouldReportPlayError(
    cause: unknown,
    attempt: number,
    currentAttempt: number
  ): boolean {
    return attempt === currentAttempt && !isAbortError(cause);
  }

  export function volumeAfterUnmute(
    currentVolume: number,
    lastAudibleVolume: number
  ): number {
    if (currentVolume > 0) return currentVolume;
    return lastAudibleVolume > 0 ? lastAudibleVolume : 1;
  }

  export function formatTime(seconds: number, showTenths = false): string {
    const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    const precision = showTenths ? 10 : 1;
    const totalUnits = Math.floor(safeSeconds * precision);
    const wholeSeconds = Math.floor(totalUnits / precision);
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = wholeSeconds % 60;
    const base = `${minutes}:${remainder.toString().padStart(2, "0")}`;
    return showTenths ? `${base}.${totalUnits % precision}` : base;
  }
}

function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    cause.name === "AbortError"
  );
}
