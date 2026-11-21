import type { Dictation } from "@/kits/composer";

// The demo uses the modern Web Speech overload that accepts its existing track.
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

export namespace DictationDemoSources {
  export function openMicrophone(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone capture is unavailable in this browser.");
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  function sampleSession(signal: AbortSignal): Dictation.Session {
    const { promise, resolve } = Promise.withResolvers<string>();
    const abort = () => resolve("");
    signal.addEventListener("abort", abort, { once: true });
    return {
      result: promise,
      stop() {
        signal.removeEventListener("abort", abort);
        resolve(
          "Live speech recognition was unavailable, so this is a sample transcript."
        );
      },
    };
  }

  export function webSpeechWithSample(
    onFallback: () => void
  ): Dictation.Recognizer {
    return (stream, signal) => {
      const useSample = () => {
        onFallback();
        return sampleSession(signal);
      };

      let live: Dictation.Session;
      try {
        live = webSpeech(stream, signal);
      } catch {
        return useSample();
      }

      let fallback: Dictation.Session | undefined;
      let stopped = false;
      return {
        result: live.result.catch(() => {
          if (signal.aborted) return "";
          fallback = useSample();
          if (stopped) fallback.stop();
          return fallback.result;
        }),
        stop() {
          stopped = true;
          (fallback ?? live).stop();
        },
      };
    };
  }

  const webSpeech: Dictation.Recognizer = (stream, signal) => {
    const { SpeechRecognition } = window as unknown as {
      SpeechRecognition?: new () => BrowserRecognition;
    };
    if (!SpeechRecognition) {
      throw new Error("Web Speech recognition is unavailable.");
    }
    const [track] = stream.getAudioTracks();
    if (!track) throw new Error("No microphone input is available.");

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.lang = navigator.language;
    const { promise, resolve, reject } = Promise.withResolvers<string>();
    let transcript = "";

    const detach = () => {
      signal.removeEventListener("abort", abort);
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
    };
    const abort = () => {
      detach();
      resolve("");
      recognition.abort();
    };
    const finish = () => {
      detach();
      resolve(transcript);
    };

    recognition.onresult = ({ results }) => {
      transcript = Array.from(results)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript.trim())
        .filter(Boolean)
        .join(" ");
    };
    recognition.onend = finish;
    recognition.onerror = ({ error }) => {
      if (error === "no-speech") return finish();
      detach();
      reject(new Error(`Web Speech recognition failed (${error}).`));
    };
    signal.addEventListener("abort", abort, { once: true });

    try {
      recognition.start(track);
    } catch (error) {
      detach();
      throw error;
    }
    return {
      result: promise,
      stop() {
        try {
          recognition.stop();
        } catch (error) {
          reject(error);
        }
      },
    };
  };
}
