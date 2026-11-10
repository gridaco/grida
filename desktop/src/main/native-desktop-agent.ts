// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — native Desktop composition.
import { AGENT_DEFAULT_TIER } from "@grida/agent/tiers";
import { TIER_MODEL_IDS } from "@grida/ai/catalogue";
import { CHATGPT_SUBSCRIPTION_CONFIG } from "../chatgpt-configuration";
import type { DesktopAccountSession } from "./account-session";
import { agentSidecarClient } from "./agent-sidecar-client";
import {
  nativeAgentGatewayConnection,
  nativeAgentSubscriptionSettings,
} from "./agent-sidecar-supervisor";
import {
  createChatGptOAuthCoordinator,
  type ChatGptOAuthCoordinator,
} from "./chatgpt-oauth";
import {
  NativeAgentCutover,
  type ExistingCutoff,
} from "./native-agent-cutover";
import type { NativeChatGptHost } from "./native-chatgpt-host";
import type { NativeDesktopProfile } from "./native-desktop-profile";
import type { NativeMcpLaunch } from "./native-mcp-launch";
import { NativeWorkspaceAgents } from "./native-workspace-agents";

const DRAIN_TIMEOUT_MS = 35_000;
type Subscription = Readonly<{
  host: NativeChatGptHost;
  oauth: ChatGptOAuthCoordinator;
}>;
type SubscriptionSignOut = ReturnType<ChatGptOAuthCoordinator["signOut"]>;
type LaunchOptions = Readonly<{
  provider: NativeDesktopProfile.Provider;
  openExternal: (url: string) => Promise<void>;
  workspaceCatalogRoot?: string;
  mcp?: NativeMcpLaunch;
}>;

export class NativeDesktopAgent {
  readonly chatgptOAuth?: Pick<
    ChatGptOAuthCoordinator,
    "connect" | "cancel" | "status" | "signOut"
  >;
  private owners: NativeWorkspaceAgents | undefined;
  private accountDrain: Promise<void> | undefined;
  private subscriptionConnect:
    | ReturnType<ChatGptOAuthCoordinator["connect"]>
    | undefined;
  private subscriptionSignOut: SubscriptionSignOut | undefined;
  private accountGeneration = 0;
  private transitions = 0;
  private closed = false;

  private constructor(
    private readonly cutover: NativeAgentCutover,
    private readonly account: DesktopAccountSession,
    private readonly resourcesPath: string,
    private readonly subscription?: Subscription,
    private readonly workspaceCatalogRoot?: string,
    private readonly mcp?: NativeMcpLaunch,
    private readonly provider: NativeDesktopProfile.Provider = "gateway"
  ) {
    if (subscription) {
      const { oauth } = subscription;
      this.chatgptOAuth = Object.freeze({
        connect: () => {
          if (
            this.closed ||
            this.subscriptionSignOut ||
            (this.transitions > 0 && !this.subscriptionConnect)
          )
            return Promise.reject(
              new Error("native_chatgpt_connection_unavailable")
            );
          const generation = this.accountGeneration;
          return (this.subscriptionConnect ??= oauth
            .connect()
            .then(async (result) => {
              if ("outcome" in result) return result;
              if (this.closed || generation !== this.accountGeneration)
                throw new Error("native_chatgpt_connection_unavailable");
              await this.transition(async () => {});
              return result;
            })
            .finally(() => {
              this.subscriptionConnect = undefined;
            }));
        },
        cancel: () => oauth.cancel(),
        status: () => oauth.status(),
        signOut: () => {
          if (this.closed)
            return Promise.reject(
              new Error("native_chatgpt_connection_unavailable")
            );
          return (this.subscriptionSignOut ??= this.transition(() =>
            oauth.signOut()
          ).finally(() => {
            this.subscriptionSignOut = undefined;
          }));
        },
      });
    }
  }

  static async prepareFresh(
    account: DesktopAccountSession,
    resourcesPath: string,
    options?: LaunchOptions
  ) {
    return this.compose(
      await NativeAgentCutover.prepareFresh(),
      account,
      resourcesPath,
      options
    );
  }

  static async prepareExisting(
    account: DesktopAccountSession,
    resourcesPath: string,
    existing: ExistingCutoff,
    options: LaunchOptions
  ) {
    return this.compose(
      await NativeAgentCutover.prepare(existing),
      account,
      resourcesPath,
      options
    );
  }

  private static async compose(
    cutover: NativeAgentCutover,
    account: DesktopAccountSession,
    resourcesPath: string,
    options?: LaunchOptions
  ) {
    let subscription: Subscription | undefined;
    if (options?.provider === "chatgpt") {
      const { userDataPath, network } = await nativeAgentSubscriptionSettings();
      const { NativeChatGptHost } = await import("./native-chatgpt-host");
      const host = new NativeChatGptHost(userDataPath, network);
      const oauth = createChatGptOAuthCoordinator({
        sidecar_fetch: (route, init) => host.ceremonyRequest(route, init),
        open_external: options.openExternal,
      });
      subscription = { host, oauth };
    }
    return new NativeDesktopAgent(
      cutover,
      account,
      resourcesPath,
      subscription,
      options?.workspaceCatalogRoot,
      options?.mcp,
      options?.provider
    );
  }

  current(workspaceId: string) {
    return this.owners?.current(workspaceId) ?? null;
  }

  async ensure(workspaceId: string): Promise<void> {
    const generation = this.accountGeneration;
    if (this.accountDrain) await this.accountDrain;
    if (this.closed || generation !== this.accountGeneration)
      throw new Error("native_workspace_closing");
    const owners = (this.owners ??= this.newOwners());
    const workspace = await agentSidecarClient.findWorkspace(workspaceId);
    if (!workspace) throw new Error("native_workspace_not_registered");
    await owners.open(workspace);
  }

  clearAccount(): Promise<void> {
    if (this.closed) return this.accountDrain ?? Promise.resolve();
    return this.transition(async () => {
      await this.subscription?.oauth.cancel();
    });
  }

  close(): Promise<void> {
    if (this.closed) return this.accountDrain ?? Promise.resolve();
    this.closed = true;
    const previous = this.accountDrain;
    return this.transition(async () => {
      try {
        await this.subscription?.oauth.close();
      } finally {
        // A prior sign-out may still be publishing deletion through this owner.
        await previous?.catch(() => {});
        await this.subscription?.host.close();
      }
    });
  }

  private transition<T>(action: () => Promise<T>): Promise<T> {
    this.accountGeneration += 1;
    this.transitions += 1;
    const owners = this.owners;
    this.owners = undefined;
    const settled = Promise.allSettled([
      this.accountDrain,
      Promise.resolve().then(() => owners?.close()),
      Promise.resolve().then(action),
    ]);
    const result = withinDrainDeadline(
      settled.then(async ([previous, workspace, applied]) => {
        await this.subscription?.host.drain();
        if (applied.status === "rejected") throw applied.reason;
        if (previous.status === "rejected" || workspace.status === "rejected")
          throw new Error("native_workspace_shutdown_unverified");
        return applied.value;
      })
    ).finally(() => {
      this.transitions -= 1;
    });
    this.accountDrain = result.then(() => {});
    void this.accountDrain.catch(() => {});
    return result;
  }

  private newOwners(): NativeWorkspaceAgents {
    return new NativeWorkspaceAgents(
      this.cutover,
      async ({ id, root }, signal) => {
        const { provider, release } = await this.prepareProvider(signal);
        return {
          launch: {
            ...provider,
            mcp: this.mcp?.forWorkspace(root),
            resourcesPath: this.resourcesPath,
            workspace: {
              id,
              primary: { id: "project", name: "Project", path: root },
              additionalReadRoots: [],
              protectedPaths: this.workspaceCatalogRoot
                ? [...this.cutover.protectedPaths, this.workspaceCatalogRoot]
                : this.cutover.protectedPaths,
            },
          },
          release,
        };
      }
    );
  }

  private async prepareProvider(signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.subscription) {
      return {
        provider: await this.subscription.host.launch(
          CHATGPT_SUBSCRIPTION_CONFIG.default_model_id,
          signal
        ),
      };
    }
    if (typeof this.provider !== "string") {
      const { kind, id, model } = this.provider;
      const provider =
        kind === "byok"
          ? await agentSidecarClient.nativeBuiltInByok(id, model)
          : await agentSidecarClient.nativeConfiguredEndpoint(id, model);
      signal.throwIfAborted();
      return { provider };
    }
    const gateway = await nativeAgentGatewayConnection(
      this.account,
      undefined,
      signal
    );
    return {
      provider: {
        ...gateway.launch(TIER_MODEL_IDS[AGENT_DEFAULT_TIER]),
        subagents: true as const,
      },
      release: () => gateway.close(),
    };
  }
}

async function withinDrainDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("native_workspace_shutdown_unverified")),
          DRAIN_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
