// GRIDA-SEC-008 — native Desktop subscription authority and private launch.
import { ChatGptSubscriptionHost } from "@grida/agent/chatgpt-host";
import {
  CHATGPT_RESPONSES_URL,
  CHATGPT_SUBSCRIPTION_CONFIG,
  CHATGPT_TOKEN_URL,
} from "../chatgpt-configuration";
import type { NativeAgentLaunch } from "./native-agent-process";
import type { NativeProviderNetwork } from "./native-provider-egress";

export class NativeChatGptHost {
  private readonly owner: ChatGptSubscriptionHost;

  constructor(userDataPath: string, network: NativeProviderNetwork) {
    this.owner = new ChatGptSubscriptionHost({
      userDataPath,
      configuration: CHATGPT_SUBSCRIPTION_CONFIG,
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

  ceremonyRequest(route: string, init?: RequestInit): Promise<Response> {
    return this.owner.ceremonyRequest(route, init);
  }

  drain(): Promise<void> {
    return this.owner.drain();
  }

  close(): Promise<void> {
    return this.owner.close();
  }

  async launch(
    modelId: string,
    lifetime?: AbortSignal
  ): Promise<
    Pick<
      NativeAgentLaunch,
      | "provider"
      | "endpoint"
      | "model"
      | "providerNetwork"
      | "subscriptionScope"
    >
  > {
    const connection = await this.owner.capture(modelId);
    return {
      provider: "responses",
      endpoint: CHATGPT_RESPONSES_URL.slice(0, -"/responses".length),
      model: connection.model,
      subscriptionScope: connection.scope,
      providerNetwork: {
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
