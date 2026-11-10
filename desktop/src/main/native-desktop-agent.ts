// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — native Desktop composition.
import { randomUUID } from "node:crypto";
import { AGENT_DEFAULT_TIER } from "@grida/agent/tiers";
import { TIER_MODEL_IDS } from "@grida/ai/catalogue";
import type { Workspace } from "@grida/daemon";
import type { NativeChatProfileSelection } from "@grida/desktop-bridge";
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
import { NativeChatProfiles } from "./native-chat-profiles";
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
  selectableProfiles?: boolean;
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
  private readonly configurationEpoch = randomUUID();
  private profileWrites = Promise.resolve();

  private constructor(
    private readonly cutover: NativeAgentCutover,
    private readonly account: DesktopAccountSession,
    private readonly resourcesPath: string,
    private readonly subscription?: Subscription,
    private readonly workspaceCatalogRoot?: string,
    private readonly mcp?: NativeMcpLaunch,
    private readonly provider: NativeDesktopProfile.Provider = "gateway",
    readonly selectableProfiles = false
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
      options?.provider,
      options?.selectableProfiles
    );
  }

  current(workspaceId: string, profileId?: string) {
    return this.owners?.current(workspaceId, profileId) ?? null;
  }

  async ensure(workspaceId: string): Promise<void> {
    const { workspace } = await this.workspace(workspaceId);
    const owners = (this.owners ??= this.newOwners());
    await owners.open(workspace);
  }

  async profiles(workspaceId: string) {
    this.requireProfiles();
    const { workspace, requireCurrent } = await this.workspace(workspaceId);
    const directory = await this.cutover.workspaceDirectory(
      workspace.id,
      workspace.root
    );
    const [choices, saved] = await Promise.all([
      this.availableProfiles(),
      NativeChatProfiles.read(directory),
    ]);
    requireCurrent();
    const available = new Set(choices.map(({ id }) => id));
    return {
      choices: choices.map(publicProfile),
      saved: saved.map((profile) => ({
        ...publicProfile(profile),
        available: available.has(profile.id),
      })),
    };
  }

  async selectProfile(
    workspaceId: string,
    selection: NativeChatProfileSelection,
    requireFrame: () => void
  ): Promise<void> {
    this.requireProfiles();
    if (selection.kind === "default") {
      requireFrame();
      await this.ensure(workspaceId);
      return;
    }
    const { workspace, requireCurrent } = await this.workspace(workspaceId);
    const check = () => {
      requireCurrent();
      requireFrame();
    };
    check();
    const directory = await this.cutover.workspaceDirectory(
      workspace.id,
      workspace.root
    );
    const profiles =
      selection.kind === "new"
        ? await this.availableProfiles()
        : await NativeChatProfiles.read(directory);
    const profile = profiles.find(({ id }) => id === selection.id);
    if (!profile) throw new Error("native_chat_profile_unavailable");
    const resolve = async () => {
      const launch = await agentSidecarClient.nativeConfiguredEndpoint(
        profile.providerId,
        profile.modelId
      );
      check();
      if (NativeChatProfiles.binding(profile.providerId, launch) !== profile.id)
        throw new Error("native_chat_profile_changed");
      return launch;
    };
    await resolve();
    if (selection.kind === "new") {
      const publish = this.profileWrites.then(async () => {
        check();
        await this.cutover.workspaceDirectory(
          workspace.id,
          workspace.root,
          true
        );
        await NativeChatProfiles.remember(directory, profile, check);
      });
      this.profileWrites = publish.catch(() => {});
      await publish;
    }
    check();
    const owners = (this.owners ??= this.newOwners());
    await owners.open(workspace, {
      id: profile.id,
      prepare: async (signal) => {
        signal.throwIfAborted();
        // Settings or an approval may have changed while publishing the receipt.
        const current = await resolve();
        signal.throwIfAborted();
        return {
          launch: await this.workspaceLaunch(workspace, current),
        };
      },
    });
  }

  private requireProfiles(): void {
    if (!this.selectableProfiles)
      throw new Error("native_chat_profiles_unavailable");
  }

  private async availableProfiles() {
    return await NativeChatProfiles.choices(
      await agentSidecarClient.listProviderEndpoints(),
      agentSidecarClient.nativeConfiguredEndpoint
    );
  }

  private async workspace(workspaceId: string) {
    const generation = this.accountGeneration;
    const requireCurrent = () => {
      if (this.closed || generation !== this.accountGeneration)
        throw new Error("native_workspace_closing");
    };
    if (this.accountDrain) await this.accountDrain;
    requireCurrent();
    const workspace = await agentSidecarClient.findWorkspace(workspaceId);
    requireCurrent();
    if (!workspace) throw new Error("native_workspace_not_registered");
    return { workspace, requireCurrent };
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
      async (workspace, signal) => {
        const { provider, release } = await this.prepareProvider(signal);
        try {
          return {
            launch: {
              ...(await this.workspaceLaunch(workspace, provider)),
              mcp: this.mcp?.forWorkspace(workspace.root),
            },
            release,
          };
        } catch (error) {
          release?.();
          throw error;
        }
      }
    );
  }

  private async workspaceLaunch(
    { id, root }: Pick<Workspace, "id" | "root">,
    provider: Awaited<
      ReturnType<NativeDesktopAgent["prepareProvider"]>
    >["provider"]
  ) {
    const workspaceConfiguration = this.selectableProfiles
      ? {
          directory: await this.cutover.workspaceDirectory(id, root),
          epoch: this.configurationEpoch,
        }
      : undefined;
    return {
      ...provider,
      workspaceConfiguration,
      resourcesPath: this.resourcesPath,
      workspace: {
        id,
        primary: { id: "project", name: "Project", path: root },
        additionalReadRoots: [],
        protectedPaths: this.workspaceCatalogRoot
          ? [...this.cutover.protectedPaths, this.workspaceCatalogRoot]
          : this.cutover.protectedPaths,
      },
    };
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

function publicProfile({ id, connection, model }: NativeChatProfiles.Saved) {
  return { id, connection, model };
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
