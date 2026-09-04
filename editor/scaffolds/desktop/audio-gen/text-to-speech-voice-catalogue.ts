import type {
  TextToSpeechListVoicesResult,
  TextToSpeechVoice,
} from "@/lib/desktop/bridge";
import type { ElevenLabsConnection } from "./elevenlabs-connection-state";

export type TextToSpeechVoiceCatalogueSnapshot =
  | Readonly<{ kind: "loading"; selectedVoiceId: string | null }>
  | Readonly<{
      kind: "ready";
      voices: readonly TextToSpeechVoice[];
      selectedVoiceId: string | null;
    }>
  | Readonly<{ kind: "missing"; selectedVoiceId: string | null }>
  | Readonly<{ kind: "error"; selectedVoiceId: string | null }>;

type TextToSpeechVoiceCatalogueDependencies = Readonly<{
  listVoices: () => Promise<TextToSpeechListVoicesResult>;
  refreshConnection: () => Promise<ElevenLabsConnection.State>;
}>;

const INITIAL_SNAPSHOT: TextToSpeechVoiceCatalogueSnapshot = Object.freeze({
  kind: "loading",
  selectedVoiceId: null,
});

/**
 * Testable voice-discovery state machine for the ElevenLabs composer.
 *
 * The controller owns request ordering and selection reconciliation. React only
 * subscribes to immutable snapshots and starts or retries a load.
 */
export class TextToSpeechVoiceCatalogue {
  readonly #listeners = new Set<() => void>();
  #snapshot = INITIAL_SNAPSHOT;
  #loadEpoch = 0;

  constructor(
    private readonly dependencies: TextToSpeechVoiceCatalogueDependencies
  ) {}

  readonly getSnapshot = (): TextToSpeechVoiceCatalogueSnapshot =>
    this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  select(voiceId: string | null): void {
    if (this.#snapshot.kind !== "ready") return;
    const selectedVoiceId =
      voiceId &&
      this.#snapshot.voices.some((voice) => voice.voice_id === voiceId)
        ? voiceId
        : null;
    if (selectedVoiceId === this.#snapshot.selectedVoiceId) return;
    this.#publish({ ...this.#snapshot, selectedVoiceId });
  }

  async load(): Promise<void> {
    const epoch = ++this.#loadEpoch;
    const selectedVoiceId = this.#snapshot.selectedVoiceId;
    this.#publish({ kind: "loading", selectedVoiceId });

    try {
      const result = await this.dependencies.listVoices();
      if (epoch !== this.#loadEpoch) return;
      const voices = Object.freeze(
        result.voices.map((voice) => Object.freeze({ ...voice }))
      );
      this.#publish({
        kind: "ready",
        voices,
        selectedVoiceId:
          selectedVoiceId &&
          voices.some((voice) => voice.voice_id === selectedVoiceId)
            ? selectedVoiceId
            : null,
      });
    } catch {
      const connection = await this.dependencies.refreshConnection();
      if (epoch !== this.#loadEpoch) return;
      this.#publish({
        kind: connection.kind === "missing" ? "missing" : "error",
        selectedVoiceId,
      });
    }
  }

  readonly cancelPending = (): void => {
    this.#loadEpoch += 1;
  };

  #publish(snapshot: TextToSpeechVoiceCatalogueSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of this.#listeners) listener();
  }
}
