// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — native Desktop composition.
import { randomUUID } from "node:crypto";
import { AGENT_DEFAULT_TIER } from "@grida/agent/tiers";
import { TIER_MODEL_IDS } from "@grida/ai/catalogue";
import type { Workspace } from "@grida/daemon";
import type { WorkspaceDirectoryIdentity } from "@grida/daemon/server";
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
import { NativeProviderSelection } from "./native-provider-selection";
import type { NativeNestedDeckGrant } from "./native-workspace-catalog";
import { NativeWorkspaceAgents } from "./native-workspace-agents";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";
import type { NativeChatLifecycle } from "./native-agent-chat";

const DRAIN_TIMEOUT_MS = 35_000;
type Subscription = Readonly<{
  host: NativeChatGptHost;
  oauth: ChatGptOAuthCoordinator;
}>;
type SubscriptionSignOut = ReturnType<ChatGptOAuthCoordinator["signOut"]>;
type SelectedWorkspace = Pick<Workspace, "id" | "root"> & {
  identity?: WorkspaceDirectoryIdentity;
};
type WorkspaceActivity = {
  captures: number;
  retired: boolean;
  forgetting?: Promise<void>;
};
type LaunchOptions = Readonly<{
  provider: NativeDesktopProfile.Provider;
  openExternal: (url: string) => Promise<void>;
  workspaceCatalogRoot?: string;
  workspaceGrant?: (id: string) => Promise<WorkspaceMediaGrant>;
  mcp?: NativeMcpLaunch;
  selectableProfiles?: boolean;
  onLifecycle?: (
    workspaceId: string,
    event: NativeChatLifecycle,
    current: () => boolean
  ) => void;
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
  private readonly workspaceActivity = new Map<string, WorkspaceActivity>();
  private profileWrites = Promise.resolve();

  private constructor(
    private readonly cutover: NativeAgentCutover,
    private readonly account: DesktopAccountSession,
    private readonly resourcesPath: string,
    private readonly subscription?: Subscription,
    private readonly workspaceCatalogRoot?: string,
    private readonly workspaceGrant?: LaunchOptions["workspaceGrant"],
    private readonly mcp?: NativeMcpLaunch,
    private readonly provider: NativeDesktopProfile.Provider = "gateway",
    readonly selectableProfiles = false,
    private readonly onLifecycle?: LaunchOptions["onLifecycle"]
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
      options?.workspaceGrant,
      options?.mcp,
      options?.provider,
      options?.selectableProfiles,
      options?.onLifecycle
    );
  }

  current(workspaceId: string, profileId?: string) {
    if (this.workspaceActivity.get(workspaceId)?.retired) return null;
    return this.owners?.current(workspaceId, profileId) ?? null;
  }

  async ensure(workspaceId: string): Promise<void> {
    await this.withWorkspace(workspaceId, async (workspace, requireCurrent) => {
      const owners = (this.owners ??= this.newOwners());
      await owners.open(workspace);
      requireCurrent();
    });
  }

  async ensureDocument(key: string, requireCurrent: () => void): Promise<void> {
    const generation = this.accountGeneration;
    if (this.accountDrain) await this.accountDrain;
    const check = () => {
      requireCurrent();
      if (this.closed || generation !== this.accountGeneration)
        throw new Error("native_workspace_closing");
    };
    check();
    await (this.owners ??= this.newOwners()).open({
      id: key,
      requireCurrent: check,
    });
    check();
  }

  currentDocument(key: string) {
    return this.owners?.currentDocument(key) ?? null;
  }

  closeDocument(key: string): Promise<void> {
    return this.owners?.closeDocument(key) ?? Promise.resolve();
  }

  currentNestedDeck(parentWorkspaceId: string, key: string) {
    if (this.workspaceActivity.get(parentWorkspaceId)?.retired) return null;
    return this.owners?.currentNestedDeck(key) ?? null;
  }

  closeNestedDeck(key: string): Promise<void> {
    return this.owners?.closeNestedDeck(key) ?? Promise.resolve();
  }

  async ensureNestedDeck(
    grant: NativeNestedDeckGrant,
    requireFrame: () => void | Promise<void>
  ) {
    await this.withWorkspace(
      grant.parentWorkspaceId,
      async (parent, requireParent) => {
        const identity = grant.parentIdentity;
        if (
          parent.identity?.device !== identity.device ||
          parent.identity.inode !== identity.inode ||
          parent.identity.birthTimeNs !== identity.birthTimeNs
        )
          throw new Error("native_chat_scope_changed");
        const requireCurrent = async () => {
          requireParent();
          await requireFrame();
          requireParent();
        };
        await requireCurrent();
        const owners = (this.owners ??= this.newOwners());
        await owners.open({
          id: grant.workspaceId,
          root: grant.root,
          identity: grant.identity,
          nestedDeck: {
            parentWorkspaceId: grant.parentWorkspaceId,
            protectedPaths: grant.protected,
            requireCurrent,
          },
        });
        await requireCurrent();
      }
    );
  }

  forgetWorkspace(workspaceId: string): Promise<void> {
    const activity: WorkspaceActivity = this.workspaceActivity.get(
      workspaceId
    ) ?? {
      captures: 0,
      retired: false,
    };
    if (activity.forgetting) return activity.forgetting;
    // Invalidate captures before any asynchronous drain or catalog mutation.
    activity.retired = true;
    this.workspaceActivity.set(workspaceId, activity);
    const owners = this.owners;
    activity.forgetting = Promise.resolve()
      .then(async () => {
        await owners?.closeWorkspace(workspaceId);
        await agentSidecarClient.forgetWorkspace(workspaceId);
      })
      .finally(() => {
        if (this.workspaceActivity.get(workspaceId) === activity)
          this.workspaceActivity.delete(workspaceId);
      });
    return activity.forgetting;
  }

  async profiles(workspaceId: string) {
    this.requireProfiles();
    return await this.withWorkspace(
      workspaceId,
      async (workspace, requireCurrent) => {
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
    );
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
    await this.withWorkspace(workspaceId, (workspace, requireCurrent) =>
      this.openProviderProfile(workspace, selection, () => {
        requireCurrent();
        requireFrame();
      })
    );
  }

  private async openProviderProfile(
    workspace: SelectedWorkspace,
    selection: Exclude<NativeChatProfileSelection, { kind: "default" }>,
    check: () => void
  ): Promise<void> {
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
    const launchProfile = NativeProviderSelection.isBuiltInByok(
      profile.providerId
    )
      ? agentSidecarClient.nativeBuiltInByok
      : agentSidecarClient.nativeConfiguredEndpoint;
    const resolve = async () => {
      const launch = await launchProfile(profile.providerId, profile.modelId);
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
    check();
  }

  private requireProfiles(): void {
    if (!this.selectableProfiles)
      throw new Error("native_chat_profiles_unavailable");
  }

  private async availableProfiles() {
    const [builtIn, configured] = await Promise.all([
      NativeChatProfiles.builtInChoices(agentSidecarClient.nativeBuiltInByok),
      agentSidecarClient
        .listProviderEndpoints()
        .then((endpoints) =>
          NativeChatProfiles.choices(
            endpoints,
            agentSidecarClient.nativeConfiguredEndpoint
          )
        ),
    ]);
    return [...builtIn, ...configured];
  }

  private async withWorkspace<T>(
    workspaceId: string,
    use: (
      workspace: SelectedWorkspace,
      requireCurrent: () => void
    ) => Promise<T>
  ): Promise<T> {
    const activity: WorkspaceActivity = this.workspaceActivity.get(
      workspaceId
    ) ?? {
      captures: 0,
      retired: false,
    };
    const generation = this.accountGeneration;
    const requireCurrent = () => {
      if (
        activity.retired ||
        this.closed ||
        generation !== this.accountGeneration
      )
        throw new Error("native_workspace_closing");
    };
    requireCurrent();
    this.workspaceActivity.set(workspaceId, activity);
    activity.captures++;
    try {
      if (this.accountDrain) await this.accountDrain;
      requireCurrent();
      const grant = await this.workspaceGrant?.(workspaceId);
      const workspace = grant
        ? { id: grant.workspaceId, root: grant.root, identity: grant.identity }
        : await agentSidecarClient.findWorkspace(workspaceId);
      requireCurrent();
      if (workspace?.id !== workspaceId)
        throw new Error("native_workspace_not_registered");
      return await use(workspace, requireCurrent);
    } finally {
      activity.captures--;
      if (
        !activity.captures &&
        !activity.forgetting &&
        this.workspaceActivity.get(workspaceId) === activity
      )
        this.workspaceActivity.delete(workspaceId);
    }
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
    const accountGeneration = this.accountGeneration;
    const notify = this.onLifecycle;
    const owners: NativeWorkspaceAgents = new NativeWorkspaceAgents(
      this.cutover,
      async (workspace, signal) => {
        const { provider, release } = await this.prepareProvider(signal);
        try {
          if (!("root" in workspace))
            return {
              launch: {
                ...provider,
                subagents: undefined,
                resourcesPath: this.resourcesPath,
              },
              release,
            };
          return {
            launch: {
              ...(await this.workspaceLaunch(
                workspace,
                provider,
                workspace.nestedDeck?.protectedPaths
              )),
              mcp: workspace.nestedDeck
                ? undefined
                : this.mcp?.forWorkspace(workspace.root),
              onLifecycle:
                !notify || workspace.nestedDeck
                  ? undefined
                  : (event, attached) => {
                      const current = () =>
                        attached() &&
                        !signal.aborted &&
                        this.accountGeneration === accountGeneration &&
                        this.owners === owners &&
                        this.current(workspace.id) !== null;
                      if (current()) notify(workspace.id, event, current);
                    },
            },
            release,
          };
        } catch (error) {
          release?.();
          throw error;
        }
      }
    );
    return owners;
  }

  private async workspaceLaunch(
    { id, root, identity }: SelectedWorkspace,
    provider: Awaited<
      ReturnType<NativeDesktopAgent["prepareProvider"]>
    >["provider"],
    nestedProtectedPaths?: readonly string[]
  ) {
    const workspaceConfiguration =
      this.selectableProfiles && !nestedProtectedPaths
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
        primary: {
          id: "project",
          name: "Project",
          path: root,
          ...(identity && { identity }),
        },
        additionalReadRoots: [],
        protectedPaths: [
          ...this.cutover.protectedPaths,
          ...(this.workspaceCatalogRoot ? [this.workspaceCatalogRoot] : []),
          ...(nestedProtectedPaths ?? []),
        ],
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
