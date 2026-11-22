import {
  DESKTOP_VOICE_MAX_AUDIO_BYTES,
  DESKTOP_VOICE_WAV_MAX_SECONDS,
  DESKTOP_VOICE_WAV_MIME_TYPE,
  DESKTOP_VOICE_WAV_SAMPLE_RATE,
  DESKTOP_VOICE_WEBM_MIME_TYPE,
  type DesktopVoiceProvider,
  type DesktopVoiceTranscriptionRequest,
  type DesktopVoiceTranscriptionResult,
} from "@grida/desktop-bridge";
import type { Dictation } from "@/kits/composer";

export type DictationIssue =
  | "microphone_denied"
  | "microphone_unavailable"
  | "recording_failed"
  | "recording_limit"
  | Exclude<DesktopVoiceTranscriptionResult, { ok: true }>["error"];

export class DictationFailure extends Error {
  constructor(readonly issue: DictationIssue) {
    super(issue);
  }
}

export async function openDictationMicrophone(
  microphoneId: string
): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio:
        microphoneId === "default"
          ? true
          : { deviceId: { exact: microphoneId } },
      video: false,
    });
  } catch (error) {
    throw new DictationFailure(
      error instanceof DOMException && error.name === "NotAllowedError"
        ? "microphone_denied"
        : "microphone_unavailable"
    );
  }
}

/** Collects one bounded recording and dispatches it only when Stop is pressed. */
export function recordDictation(
  stream: MediaStream,
  signal: AbortSignal,
  transport: {
    transcribe(
      request: DesktopVoiceTranscriptionRequest
    ): Promise<DesktopVoiceTranscriptionResult>;
    cancel(id: string): Promise<void>;
  },
  provider: DesktopVoiceProvider
): Dictation.Session {
  if (signal.aborted) return { result: Promise.resolve(""), stop() {} };
  if (typeof MediaRecorder === "undefined")
    throw new DictationFailure("recording_failed");
  const mimeType = MediaRecorder.isTypeSupported(DESKTOP_VOICE_WEBM_MIME_TYPE)
    ? DESKTOP_VOICE_WEBM_MIME_TYPE
    : "audio/webm";
  const recorder = new MediaRecorder(stream, { mimeType });
  const { promise: result, resolve, reject } = Promise.withResolvers<string>();
  const id = crypto.randomUUID();
  const chunks: Blob[] = [];
  let bytes = 0;
  let requestedStop = false;
  let uploading = false;
  let durationLimit: ReturnType<typeof setTimeout> | undefined;

  function release() {
    clearTimeout(durationLimit);
    signal.removeEventListener("abort", abort);
    recorder.removeEventListener("dataavailable", collect);
    recorder.removeEventListener("stop", complete);
    recorder.removeEventListener("error", fail);
    chunks.length = 0;
    if (recorder.state !== "inactive") recorder.stop();
  }

  function abort() {
    if (uploading) void transport.cancel(id).catch(() => {});
    release();
    resolve("");
  }

  function fail() {
    release();
    reject(new DictationFailure("recording_failed"));
  }

  function collect(event: BlobEvent) {
    if (event.data.size === 0) return;
    bytes += event.data.size;
    if (bytes > DESKTOP_VOICE_MAX_AUDIO_BYTES) {
      release();
      reject(new DictationFailure("recording_limit"));
      return;
    }
    chunks.push(event.data);
  }

  async function complete() {
    if (!requestedStop) {
      fail();
      return;
    }

    try {
      if (bytes === 0) {
        resolve("");
        return;
      }
      const recording = new Blob(chunks, { type: mimeType });
      chunks.length = 0;
      let audio = await recording.arrayBuffer();
      if (signal.aborted) return;
      if (provider === "grida") audio = await encodeVoiceWav(audio, signal);
      if (signal.aborted) return;
      uploading = true;
      const response = await transport.transcribe({
        id,
        audio,
        mimeType: provider === "grida" ? DESKTOP_VOICE_WAV_MIME_TYPE : mimeType,
      });
      if (response.ok) resolve(response.text);
      else reject(new DictationFailure(response.error));
    } catch (error) {
      reject(
        error instanceof DictationFailure
          ? error
          : new DictationFailure("unavailable")
      );
    } finally {
      uploading = false;
      release();
    }
  }

  recorder.addEventListener("dataavailable", collect);
  recorder.addEventListener("stop", complete);
  recorder.addEventListener("error", fail);
  signal.addEventListener("abort", abort, { once: true });
  try {
    recorder.start(1000);
    if (provider === "grida") {
      durationLimit = setTimeout(() => {
        release();
        reject(new DictationFailure("recording_limit"));
      }, DESKTOP_VOICE_WAV_MAX_SECONDS * 1000);
    }
  } catch {
    release();
    throw new DictationFailure("recording_failed");
  }

  return {
    result,
    stop() {
      if (recorder.state === "inactive") return;
      clearTimeout(durationLimit);
      requestedStop = true;
      recorder.stop();
    },
  };
}

/** Grida Gateway requires mono, 16 kHz, signed 16-bit PCM in a RIFF WAV. */
async function encodeVoiceWav(
  recording: ArrayBuffer,
  signal: AbortSignal
): Promise<ArrayBuffer> {
  const sampleRate = DESKTOP_VOICE_WAV_SAMPLE_RATE;
  let decoded: AudioBuffer;
  try {
    const context = new OfflineAudioContext(1, 1, sampleRate);
    decoded = await context.decodeAudioData(recording);
  } catch {
    throw new DictationFailure("invalid_audio");
  }
  signal.throwIfAborted();
  if (decoded.length > sampleRate * DESKTOP_VOICE_WAV_MAX_SECONDS) {
    throw new DictationFailure("recording_limit");
  }

  const headerBytes = 44;
  const bytesPerSample = 2;
  const payloadBytes = decoded.length * bytesPerSample;
  const wav = new ArrayBuffer(headerBytes + payloadBytes);
  const view = new DataView(wav);
  const bytes = new Uint8Array(wav);
  const ascii = new TextEncoder();
  bytes.set(ascii.encode("RIFF"), 0);
  view.setUint32(4, wav.byteLength - 8, true);
  bytes.set(ascii.encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true); // PCM format chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  bytes.set(ascii.encode("data"), 36);
  view.setUint32(40, payloadBytes, true);

  const channels = Array.from(
    { length: decoded.numberOfChannels },
    (_, index) => decoded.getChannelData(index)
  );
  for (let frame = 0; frame < decoded.length; frame++) {
    let mix = 0;
    for (const channel of channels) mix += channel[frame];
    const sample = Math.max(-1, Math.min(1, mix / channels.length));
    const pcm = Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff));
    view.setInt16(headerBytes + frame * bytesPerSample, pcm, true);
  }
  return wav;
}
