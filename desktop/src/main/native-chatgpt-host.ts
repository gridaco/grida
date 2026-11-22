// GRIDA-SEC-008 — native Desktop subscription authority and private launch.
import {
  ChatGptSubscriptionHost,
  type ChatGptModelBinding,
} from "@grida/ai-host/chatgpt-host";
import {
  CHATGPT_RESPONSES_URL,
  CHATGPT_MODELS_URL,
  CHATGPT_SUBSCRIPTION_CONFIG,
  CHATGPT_TOKEN_URL,
} from "../chatgpt-configuration";
import type { NativeAgentLaunch } from "./native-agent-process";
import type { NativeProviderNetwork } from "./native-provider-egress";

export class NativeChatGptHost {
  private readonly owner: ChatGptSubscriptionHost;

  constructor(
    userDataPath: string,
    network: NativeProviderNetwork,
    turnPreferences?: ConstructorParameters<
      typeof ChatGptSubscriptionHost
    >[0]["turnPreferences"]
  ) {
    this.owner = new ChatGptSubscriptionHost({
      userDataPath,
      turnPreferences,
      configuration: CHATGPT_SUBSCRIPTION_CONFIG,
      getModels: async (target, headers, signal) =>
        target === CHATGPT_MODELS_URL && !signal.aborted
          ? ((await network.getSubscriptionModels?.(headers, signal)) ?? null)
          : null,
      post: async (target, headers, body, signal) => {
        if (
          signal.aborted ||
          (target !== CHATGPT_TOKEN_URL && target !== CHATGPT_RESPONSES_URL)
        )
          return null;
        const dispatch = network.prepare(target, headers);
        return dispatch ? await dispatch(body, signal) : null;
      },
    });
  }

  start(redirectUri: string) {
    return this.owner.start(redirectUri);
  }

  complete(input: { attempt_id: string; code: string; state: string }) {
    return this.owner.complete(input);
  }

  cancel(attemptId: string) {
    return this.owner.cancel(attemptId);
  }

  status() {
    return this.owner.status();
  }

  signOut() {
    return this.owner.signOut();
  }

  drain(): Promise<void> {
    return this.owner.drain();
  }

  close(): Promise<void> {
    return this.owner.close();
  }

  scope() {
    return this.owner.scope();
  }

  inventory() {
    return this.owner.inventory();
  }

  async launch(
    modelId: string,
    lifetime?: AbortSignal,
    binding?: ChatGptModelBinding
  ): Promise<
    Pick<
      NativeAgentLaunch,
      "provider" | "endpoint" | "model" | "wireModel" | "providerNetwork"
    > &
      Required<
        Pick<
          NativeAgentLaunch,
          "subscriptionScope" | "subscriptionCapabilities"
        >
      >
  > {
    const connection = await this.owner.capture(modelId, binding);
    return {
      provider: "responses",
      endpoint: CHATGPT_RESPONSES_URL.slice(0, -"/responses".length),
      model: connection.model,
      ...(binding && { wireModel: connection.wireModel }),
      subscriptionScope: connection.scope,
      subscriptionCapabilities: connection.capabilities,
      providerNetwork: {
        isCurrent: connection.isCurrent,
        prepare: (target, headers) =>
          target === connection.target &&
          headers.get("content-type") === "application/json" &&
          headers.get("accept") === "text/event-stream" &&
          [...headers.keys()].length === 2 &&
          !lifetime?.aborted
            ? (body, signal) =>
                connection.request(
                  body,
                  lifetime ? AbortSignal.any([signal, lifetime]) : signal
                )
            : null,
      },
    };
  }
}
