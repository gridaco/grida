import type { Dictation } from "@/kits/composer";

const SAMPLE_TRANSCRIPT =
  "Browser speech recognition was unavailable. This is a sample transcript.";
const FINALIZATION_TIMEOUT_MS = 5000;

type BrowserRecognition = {
  continuous: boolean;
  lang: string;
  onresult:
    | ((event: {
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(track: MediaStreamTrack): void;
  stop(): void;
  abort(): void;
};

export const recognizeDemoSpeech: Dictation.Recognizer = (stream, signal) => {
  const { promise, resolve } = Promise.withResolvers<string>();
  let recognition: BrowserRecognition | undefined;
  let transcript = "";
  let outcome: string | undefined;
  let stopped = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function finish(text: string) {
    const current = recognition;
    recognition = undefined;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
    }
    clearTimeout(timeout);
    outcome = text;
    // Browsers may finish on a pause. Keep the draft intact until Stop or Send.
    if (stopped) {
      signal.removeEventListener("abort", cancel);
      resolve(text);
    }
    return current;
  }

  function finishAndAbort(text: string) {
    try {
      finish(text)?.abort();
    } catch {
      // Recognition may already have disconnected on the browser's side.
    }
  }

  function cancel() {
    stopped = true;
    finishAndAbort("");
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (outcome !== undefined) {
      finish(outcome);
    } else {
      timeout = setTimeout(
        () => finishAndAbort(transcript || SAMPLE_TRANSCRIPT),
        FINALIZATION_TIMEOUT_MS
      );
      try {
        recognition?.stop();
      } catch {
        finishAndAbort(transcript || SAMPLE_TRANSCRIPT);
      }
    }
  }

  if (signal.aborted) {
    cancel();
    return { result: promise, stop };
  }
  signal.addEventListener("abort", cancel, { once: true });

  // Use the standard API with the existing track. Legacy prefixed versions
  // may ignore the track and open a separate default microphone.
  const { SpeechRecognition } = globalThis as unknown as {
    SpeechRecognition?: new () => BrowserRecognition;
  };
  const [track] = stream.getAudioTracks();
  if (!SpeechRecognition || !track) {
    finish(SAMPLE_TRANSCRIPT);
    return { result: promise, stop };
  }

  try {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = navigator.language;
    recognition.onresult = ({ results }) => {
      transcript = Array.from(results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript.trim())
        .filter(Boolean)
        .join(" ");
    };
    recognition.onend = () => finish(transcript);
    recognition.onerror = ({ error }) => {
      if (error === "aborted") finish("");
      else if (error === "no-speech") finish(transcript);
      else finish(transcript || SAMPLE_TRANSCRIPT);
    };
    recognition.start(track);
  } catch {
    finishAndAbort(SAMPLE_TRANSCRIPT);
  }

  return { result: promise, stop };
};
