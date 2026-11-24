import {
  isDesktopVoiceReady,
  type DesktopVoiceProvider,
  type DesktopVoiceSettings,
} from "@grida/desktop-bridge";
import { Dictation } from "@/kits/composer";
import { getDesktopBridge, voice } from "@/lib/desktop/bridge";
import {
  DictationFailure,
  openDictationMicrophone,
  recordDictation,
  type DictationIssue,
} from "./desktop-dictation";

type Notice = {
  text: string;
  settings?: boolean;
};

type Run = {
  send?: () => void;
};

type Snapshot = {
  supported: boolean;
  settings: DesktopVoiceSettings | null;
  state: Dictation.State;
  active: boolean;
  compact: boolean;
  sendPending: boolean;
  notice: Notice | null;
};

const INITIAL: Snapshot = {
  supported: false,
  settings: null,
  state: { phase: "idle" },
  active: false,
  compact: false,
  sendPending: false,
  notice: null,
};

const ISSUES: Record<DictationIssue, Notice> = {
  microphone_denied: { text: "Allow microphone access to dictate." },
  microphone_unavailable: {
    text: "The selected microphone is unavailable.",
    settings: true,
  },
  recording_failed: { text: "Couldn’t record audio. Try again." },
  recording_limit: { text: "The recording is too long. Try a shorter clip." },
  invalid_audio: { text: "Couldn’t read the recording. Try again." },
  key_rejected: {
    text: "Your Voice provider rejected the API key.",
    settings: true,
  },
  not_ready: {
    text: "Voice is unavailable. Check Voice settings.",
    settings: true,
  },
  unavailable: { text: "Couldn’t transcribe the recording. Try again." },
  cancelled: { text: "Dictation was canceled." },
};

export class ComposerVoice {
  static readonly desktopHost: ComposerVoice.Host = {
    isSupported: () => !!getDesktopBridge()?.voice,
    getSettings: voice.getSettings,
    subscribe: voice.subscribe,
    openMicrophone: openDictationMicrophone,
    recognize: (stream, signal, provider) =>
      recordDictation(stream, signal, voice, provider),
  };

  private snapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private readonly dictation: Dictation;
  private run: Run | null = null;

  constructor(private readonly host = ComposerVoice.desktopHost) {
    this.dictation = new Dictation((signal) =>
      host.openMicrophone(
        this.snapshot.settings?.microphoneId ?? "default",
        signal
      )
    );
    this.dictation.subscribe(() => {
      const state = this.dictation.getSnapshot();
      const active =
        state.phase === "starting" ||
        state.phase === "recording" ||
        state.phase === "finishing";
      const notice =
        state.phase === "error"
          ? state.error instanceof DictationFailure
            ? ISSUES[state.error.issue]
            : ISSUES.recording_failed
          : this.snapshot.notice;
      this.publish({ state, active, notice });
    });
  }

  readonly getSnapshot = (): Snapshot => this.snapshot;
  readonly getServerSnapshot = (): Snapshot => INITIAL;

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Live window state supersedes a settings read already in flight. */
  readonly connect = () => {
    if (!this.host.isSupported()) return;
    this.publish({ supported: true });
    let connected = true;
    let receivedSettings = false;
    const unsubscribe = this.host.subscribe((settings) => {
      receivedSettings = true;
      if (
        !isDesktopVoiceReady(settings) ||
        settings.provider !== this.snapshot.settings?.provider
      ) {
        this.cancel();
      }
      this.publish({ settings });
    });
    void this.host.getSettings().then(
      (settings) => {
        if (connected && !receivedSettings) this.publish({ settings });
      },
      () => {}
    );

    return () => {
      connected = false;
      unsubscribe();
      this.cancel();
    };
  };

  async start(compact: boolean, append: (text: string) => boolean) {
    const { active, settings } = this.snapshot;
    if (active || !isDesktopVoiceReady(settings)) return;
    const run: Run = {};
    this.run = run;
    this.publish({ compact, notice: null });
    const text = await this.dictation.start((stream, signal) =>
      this.host.recognize(stream, signal, settings.provider)
    );
    if (this.run !== run) return;
    const appended = !!text && append(text);
    if (this.run !== run) return;
    this.run = null;
    if (run.send) this.publish({ sendPending: false });
    if (appended) run.send?.();
    else if (text) {
      this.publish({
        notice: { text: "Couldn’t add the transcript to the draft." },
      });
    }
  }

  readonly stop = () => this.dictation.stop();

  stopAndSend(send: () => void) {
    const { run, snapshot } = this;
    if (
      !run ||
      run.send ||
      (snapshot.state.phase !== "recording" &&
        snapshot.state.phase !== "finishing")
    )
      return;
    run.send = send;
    this.publish({ sendPending: true });
    this.stop();
  }

  readonly cancel = () => {
    this.run = null;
    this.dictation.cancel();
    if (this.snapshot.notice || this.snapshot.sendPending)
      this.publish({ notice: null, sendPending: false });
  };

  private publish(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

export namespace ComposerVoice {
  export type Host = Pick<typeof voice, "getSettings" | "subscribe"> & {
    isSupported(): boolean;
    openMicrophone(deviceId: string, signal: AbortSignal): Promise<MediaStream>;
    recognize(
      stream: MediaStream,
      signal: AbortSignal,
      provider: DesktopVoiceProvider
    ): Dictation.Session;
  };
}
