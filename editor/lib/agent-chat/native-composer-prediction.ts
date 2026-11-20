import type {
  DesktopBridge,
  DesktopNativeChat,
  DesktopComposerPredictionSettings,
  NativeChatObservation,
} from "@grida/desktop-bridge";
import type { NativeChatView } from "./native-chat-controller";

/** One optional next prompt for the currently presented, empty Desktop draft. */
export class NativeComposerPrediction {
  private readonly listeners = new Set<() => void>();
  private text: string | null = null;
  private request?: {
    attachment: string;
    turn: string;
    profile: string | null;
    effort: NativeChatView["effort"];
  };
  private preference?: DesktopComposerPredictionSettings;
  private presented = false;
  private emptyScope?: number;

  constructor(private readonly bridge: DesktopNativeChat) {}

  readonly read = () => this.text;
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect(
    preferences:
      | Pick<
          NonNullable<DesktopBridge["composerPredictions"]>,
          "get" | "onChange"
        >
      | undefined
  ): () => void {
    if (!preferences || !this.bridge.predictPrompt) return () => {};
    let connected = true;
    const receive = (next: DesktopComposerPredictionSettings) => {
      if (
        !connected ||
        (this.preference && next.revision <= this.preference.revision)
      )
        return;
      this.preference = next;
      this.dismiss();
    };
    const unsubscribe = preferences.onChange(receive);
    void preferences.get().then(receive, () => {});
    return () => {
      connected = false;
      unsubscribe();
      this.preference = undefined;
      this.dismiss();
    };
  }

  setPresented(presented: boolean): void {
    this.presented = presented;
    if (!presented) this.dismiss();
  }

  /** Called synchronously on document edits as well as after draft restoration. */
  setDraft(scope: number, empty: boolean): void {
    if (empty) this.emptyScope = scope;
    else if (this.emptyScope === scope) {
      this.emptyScope = undefined;
      this.dismiss();
    }
  }

  viewChanged(attachment: string | undefined, view: NativeChatView): void {
    if (
      this.request &&
      (this.request.attachment !== attachment ||
        this.request.turn !== view.observation?.snapshot.latest?.turnId ||
        this.request.profile !== (view.profiles?.active ?? null) ||
        this.request.effort !== view.effort ||
        !this.eligible(view))
    )
      this.dismiss();
  }

  /** Repeated observations and opening a chat with an old reply cause no inference. */
  settled(
    attachment: string,
    view: NativeChatView,
    previous: NativeChatObservation | null,
    acceptedTurn: string | undefined
  ): void {
    const predict = this.bridge.predictPrompt;
    const observation = view.observation;
    const latest = observation?.snapshot.latest;
    if (
      !predict ||
      !observation ||
      !latest ||
      latest.disposition !== "settled" ||
      latest.status !== "succeeded" ||
      !this.eligible(view)
    )
      return;
    const prior = previous?.snapshot.latest;
    if (
      (!previous && acceptedTurn !== latest.turnId) ||
      (prior?.turnId === latest.turnId && prior.disposition === "settled")
    )
      return;
    const request = {
      attachment,
      turn: latest.turnId,
      profile: view.profiles?.active ?? null,
      effort: view.effort,
    };
    this.request = request;
    void predict.call(this.bridge, attachment, observation.observationId).then(
      (text) => {
        if (this.request === request) this.publish(text?.trim() || null);
      },
      () => {}
    );
  }

  /** Enforce the live state even between a preference update and React's repaint. */
  readonly take = (displayed: string): boolean => {
    if (!displayed || displayed !== this.text) return false;
    this.dismiss();
    return true;
  };

  dismiss(): void {
    this.request = undefined;
    this.publish(null);
  }

  private eligible(view: NativeChatView): boolean {
    const snapshot = view.observation?.snapshot;
    return !!(
      this.preference?.enabled &&
      this.presented &&
      this.emptyScope === view.scope &&
      snapshot &&
      snapshot.sessionId === view.selected &&
      !snapshot.side &&
      !snapshot.current &&
      !snapshot.queuedInputs &&
      !snapshot.pendingGoalId &&
      !snapshot.admissionPaused &&
      !view.profileBusy &&
      !view.submitting &&
      !view.connectionRecovery &&
      !view.attachmentDraft &&
      !view.attachmentReading &&
      !view.draftMessageContext &&
      !view.queueDraft &&
      !view.revisionDraft &&
      !view.goalIntent &&
      !view.commandRunning &&
      view.operatingRegime === "act" &&
      view.goal?.goal?.state.status !== "active"
    );
  }

  private publish(text: string | null): void {
    if (this.text === text) return;
    this.text = text;
    for (const notify of this.listeners) notify();
  }
}
