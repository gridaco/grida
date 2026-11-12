// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — native Desktop composition.
// GRIDA-GG: desktop — exact Gateway model and organization for each worker.
import { randomUUID } from "node:crypto";
import { lstatSync, realpathSync } from "node:fs";
import { GG_PROVIDER_ID } from "@grida/agent";
import { AGENT_DEFAULT_TIER } from "@grida/agent/tiers";
import { TIER_MODEL_IDS } from "@grida/ai/catalogue";
import type { Workspace } from "@grida/daemon";
import {
  ProtectedRoots,
  type WorkspaceDirectoryIdentity,
} from "@grida/daemon/server";
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
import type { NativeImagePlacement } from "./native-image-placement";
import type { ImageReferenceReview } from "./native-image-generation";
import type { NativeMcpLaunch } from "./native-mcp-launch";
import { NativeProviderSelection } from "./native-provider-selection";
import {
  NativeDeckGrant,
  type NativeNestedDeckGrant,
} from "./native-workspace-catalog";
import { NativeWorkspaceAgents } from "./native-workspace-agents";
import { NativeAgentHooks } from "./native-agent-hooks";
import type { WorkspaceMediaGrant } from "./workspace-media-registry";
import type { NativeChatLifecycle } from "./native-agent-chat";

const DRAIN_TIMEOUT_MS = 35_000;
const DEFAULT_GATEWAY_MODEL = TIER_MODEL_IDS[AGENT_DEFAULT_TIER];
type Subscription = Readonly<{
  host: NativeChatGptHost;
  oauth: ChatGptOAuthCoordinator;
}>;
type SubscriptionSignOut = ReturnType<ChatGptOAuthCoordinator["signOut"]>;
type SelectedWorkspace = Pick<Workspace, "id" | "root"> & {
  identity?: WorkspaceDirectoryIdentity;
  requireDirectoryCurrent?: () => void;
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
  imagePlacement?: (
    workspace: Pick<WorkspaceMediaGrant, "workspaceId" | "root" | "identity">
  ) => NativeImagePlacement;
  reviewImageReference?: (
    workspace: Pick<Workspace, "id" | "root">
  ) => ImageReferenceReview;
  mcp?: NativeMcpLaunch;
  selectableProfiles?: boolean;
  onLifecycle?: (
    workspaceId: string,
    event: NativeChatLifecycle,
    current: () => boolean,
    profileId?: string
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
    private readonly onLifecycle?: LaunchOptions["onLifecycle"],
    private readonly imagePlacement?: LaunchOptions["imagePlacement"],
    private readonly reviewImageReference?: LaunchOptions["reviewImageReference"],
    private readonly ordinaryWorkspaceChat = false
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

  static async prepareOrdinary(
    account: DesktopAccountSession,
    resourcesPath: string,
    protectedPaths: readonly string[],
    options: Pick<LaunchOptions, "openExternal" | "onLifecycle">
  ) {
    return this.compose(
      await NativeAgentCutover.prepareOrdinary(protectedPaths),
      account,
      resourcesPath,
      { ...options, provider: "gateway", selectableProfiles: true },
      true
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
    options?: LaunchOptions,
    ordinaryWorkspaceChat = false
  ) {
    let subscription: Subscription | undefined;
    if (options && (options.provider === "chatgpt" || ordinaryWorkspaceChat)) {
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
      options?.onLifecycle,
      options?.imagePlacement,
      options?.reviewImageReference,
      ordinaryWorkspaceChat
    );
  }

  get hasLegacyChatArchive(): boolean {
    return !this.closed && this.cutover.archive !== null;
  }

  get documentIdentitiesDirectory(): string {
    return this.cutover.documentIdentitiesDirectory;
  }

  async revealLegacyChatArchive(
    reveal: (directory: string) => void
  ): Promise<void> {
    if (!this.hasLegacyChatArchive)
      throw new Error("legacy_chat_archive_unavailable");
    const generation = this.accountGeneration;
    await this.cutover.revealLegacyChatArchive((directory) => {
      if (!this.closed && generation === this.accountGeneration)
        reveal(directory);
    });
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

  async rootDeck(workspaceId: string): Promise<WorkspaceMediaGrant> {
    return this.withWorkspace(
      workspaceId,
      async (workspace, requireCurrent) => {
        if (!workspace.identity)
          throw new Error("native_workspace_root_changed");
        const grant = await NativeDeckGrant.root({
          workspaceId: workspace.id,
          root: workspace.root,
          identity: workspace.identity,
          protected: this.cutover.protectedPaths,
        });
        requireCurrent();
        return grant;
      }
    );
  }

  async nestedDeck(
    workspaceId: string,
    relativePath: string
  ): Promise<NativeNestedDeckGrant> {
    return this.withWorkspace(
      workspaceId,
      async (workspace, requireCurrent) => {
        if (!workspace.identity)
          throw new Error("native_workspace_root_changed");
        const grant = await NativeDeckGrant.nested(
          {
            workspaceId: workspace.id,
            root: workspace.root,
            identity: workspace.identity,
            protected: this.cutover.protectedPaths,
          },
          relativePath
        );
        requireCurrent();
        return grant;
      }
    );
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

  /**
   * The connection to use when the default Gateway cannot start: a saved
   * built-in provider key with the product's default model, else that key's
   * first listed model. Configured endpoints are never chosen implicitly.
   */
  async fallbackProfile(): Promise<string | null> {
    this.requireProfiles();
    const builtIn = await NativeChatProfiles.builtInChoices(
      agentSidecarClient.nativeBuiltInByok
    );
    return (
      builtIn.find((choice) => choice.modelId === DEFAULT_GATEWAY_MODEL)?.id ??
      builtIn[0]?.id ??
      null
    );
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
        const [{ choices, previousIds }, saved] = await Promise.all([
          this.availableProfiles(workspace.id),
          NativeChatProfiles.read(directory),
        ]);
        requireCurrent();
        const available = new Set(choices.map(({ id }) => id));
        const earlier = new Set(previousIds);
        return {
          choices: choices.map(publicProfile),
          saved: saved.map((profile) => {
            const previous = earlier.has(profile.id);
            return {
              ...publicProfile(profile),
              ...(previous && {
                connection: `${profile.connection} (earlier chats)`,
              }),
              available: previous || available.has(profile.id),
            };
          }),
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
        ? (await this.availableProfiles(workspace.id)).choices
        : await NativeChatProfiles.read(directory);
    const profile = profiles.find(({ id }) => id === selection.id);
    if (!profile) throw new Error("native_chat_profile_unavailable");
    if (profile.providerId === GG_PROVIDER_ID) {
      await this.openGatewayProfile(
        workspace,
        profile,
        selection.kind === "new" ? directory : undefined,
        check
      );
      return;
    }
    const builtIn = NativeProviderSelection.isBuiltInByok(profile.providerId);
    const launchProfile = builtIn
      ? agentSidecarClient.nativeBuiltInByok
      : agentSidecarClient.nativeConfiguredEndpoint;
    const resolve = async () => {
      const launch = await launchProfile(profile.providerId, profile.modelId);
      check();
      if (NativeChatProfiles.binding(profile.providerId, launch) === profile.id)
        return launch;
      if (!builtIn) {
        const configured = NativeChatProfiles.configuredLaunch(launch);
        if (
          NativeChatProfiles.binding(profile.providerId, configured) ===
          profile.id
        )
          return configured;
        const counted = await agentSidecarClient
          .nativeConfiguredEndpoint(profile.providerId, profile.modelId, true)
          .catch(() => null);
        check();
        if (counted?.llamaCppInputCount) {
          const configuredCount = NativeChatProfiles.configuredLaunch(counted);
          if (
            NativeChatProfiles.binding(profile.providerId, configuredCount) ===
            profile.id
          )
            return configuredCount;
        }
      }
      throw new Error("native_chat_profile_changed");
    };
    await resolve();
    if (selection.kind === "new")
      await this.rememberProfile(workspace, directory, profile, check);
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
          launch: {
            ...(await this.workspaceLaunch(workspace, current)),
            onLifecycle: this.workspaceLifecycle(
              workspace.id,
              owners,
              signal,
              profile.id
            ),
          },
        };
      },
    });
    check();
  }

  private async openGatewayProfile(
    workspace: SelectedWorkspace,
    profile: NativeChatProfiles.Saved,
    saveDirectory: string | undefined,
    check: () => void
  ) {
    if (this.provider !== "gateway")
      throw new Error("native_chat_profile_unavailable");
    const models = await agentSidecarClient.listGatewayModels().catch(() => []);
    const model = models.find(({ id }) => id === profile.modelId);
    const maxOutputTokens = NativeChatProfiles.gatewayOutputLimit(model);
    if (
      maxOutputTokens === undefined ||
      profile.modelId === DEFAULT_GATEWAY_MODEL
    )
      throw new Error("native_provider_model_unavailable");
    check();
    const owners = (this.owners ??= this.newOwners());
    const requireScope = (scope: string | undefined) => {
      if (
        scope &&
        NativeChatProfiles.gatewayBinding(scope, profile.modelId) !== profile.id
      )
        throw new Error("native_chat_profile_changed");
    };
    requireScope(owners.gatewayScope(workspace.id));
    requireScope(owners.gatewayScope(workspace.id, profile.id));
    await owners.open(workspace, {
      id: profile.id,
      prepare: async (signal) => {
        check();
        signal.throwIfAborted();
        const { provider, release } = await this.prepareGatewayProvider(
          profile.modelId,
          signal
        );
        try {
          check();
          signal.throwIfAborted();
          requireScope(provider.gatewayScope);
          const launch = await this.workspaceLaunch(workspace, provider);
          if (saveDirectory)
            await this.rememberProfile(
              workspace,
              saveDirectory,
              profile,
              check
            );
          return {
            launch: {
              ...launch,
              maxOutputTokens,
              mcp: this.mcp?.forWorkspace(workspace.root),
              onLifecycle: this.workspaceLifecycle(
                workspace.id,
                owners,
                signal,
                profile.id
              ),
            },
            release,
          };
        } catch (error) {
          release();
          throw error;
        }
      },
    });
    check();
  }

  private async rememberProfile(
    workspace: SelectedWorkspace,
    directory: string,
    profile: NativeChatProfiles.Saved,
    check: () => void
  ) {
    const publish = this.profileWrites.then(async () => {
      check();
      await this.cutover.workspaceDirectory(workspace.id, workspace.root, true);
      await NativeChatProfiles.remember(directory, profile, check);
    });
    this.profileWrites = publish.catch(() => {});
    await publish;
  }

  private requireProfiles(): void {
    if (!this.selectableProfiles)
      throw new Error("native_chat_profiles_unavailable");
  }

  private async availableProfiles(workspaceId: string) {
    const gatewayScope = this.owners?.gatewayScope(workspaceId);
    const [builtIn, configured, gateway] = await Promise.all([
      NativeChatProfiles.builtInChoices(agentSidecarClient.nativeBuiltInByok),
      agentSidecarClient
        .listProviderEndpoints()
        .then((endpoints) =>
          NativeChatProfiles.configuredChoices(
            endpoints,
            agentSidecarClient.nativeConfiguredEndpoint
          )
        ),
      gatewayScope
        ? agentSidecarClient
            .listGatewayModels()
            .then((models) =>
              NativeChatProfiles.gatewayChoices(
                models,
                gatewayScope,
                DEFAULT_GATEWAY_MODEL
              )
            )
            .catch(() => [])
        : [],
    ]);
    return {
      choices: [
        ...(gatewayScope === this.owners?.gatewayScope(workspaceId)
          ? gateway
          : []),
        ...builtIn,
        ...configured.choices,
      ],
      previousIds: configured.previousIds,
    };
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
      if (!this.ordinaryWorkspaceChat)
        return await use(workspace, requireCurrent);
      const identity = ordinaryDirectoryIdentity(workspace.root);
      if (
        new ProtectedRoots(this.cutover.protectedPaths).overlaps(workspace.root)
      )
        throw new Error("native_workspace_root_denied");
      const requireDirectoryCurrent = () => {
        const current = ordinaryDirectoryIdentity(workspace.root);
        if (
          current.device !== identity.device ||
          current.inode !== identity.inode ||
          current.birthTimeNs !== identity.birthTimeNs
        )
          throw new Error("native_workspace_root_changed");
      };
      return await use(
        { ...workspace, identity, requireDirectoryCurrent },
        () => {
          requireCurrent();
          requireDirectoryCurrent();
        }
      );
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
              onLifecycle: workspace.nestedDeck
                ? undefined
                : this.workspaceLifecycle(workspace.id, owners, signal),
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

  private workspaceLifecycle(
    workspaceId: string,
    owners: NativeWorkspaceAgents,
    signal: AbortSignal,
    profileId?: string
  ) {
    const notify = this.onLifecycle;
    if (!notify) return;
    const accountGeneration = this.accountGeneration;
    return (event: NativeChatLifecycle, connected: () => boolean) => {
      const current = () =>
        connected() &&
        !signal.aborted &&
        this.accountGeneration === accountGeneration &&
        this.owners === owners &&
        this.current(workspaceId, profileId) !== null;
      if (current()) notify(workspaceId, event, current, profileId);
    };
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
            directory: await this.cutover.workspaceDirectory(id, root, true),
            epoch: this.configurationEpoch,
          }
        : undefined;
    const imageTools =
      "imageGeneration" in provider &&
      provider.imageGeneration &&
      identity &&
      !nestedProtectedPaths;
    return {
      ...provider,
      imagePlacement: imageTools
        ? this.imagePlacement?.({ workspaceId: id, root, identity })
        : undefined,
      reviewImageReference: imageTools
        ? this.reviewImageReference?.({ id, root })
        : undefined,
      workspaceConfiguration,
      hooks: workspaceConfiguration
        ? await NativeAgentHooks.open(workspaceConfiguration.directory, root)
        : undefined,
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
    if (this.provider === "chatgpt" && this.subscription) {
      return {
        provider: await this.subscription.host.launch(
          CHATGPT_SUBSCRIPTION_CONFIG.default_model_id,
          signal
        ),
        release: undefined,
      };
    }
    if (typeof this.provider !== "string") {
      const { kind, id, model } = this.provider;
      const provider =
        kind === "byok"
          ? await agentSidecarClient.nativeBuiltInByok(id, model)
          : await agentSidecarClient.nativeConfiguredEndpoint(id, model);
      signal.throwIfAborted();
      return { provider, release: undefined };
    }
    return await this.prepareGatewayProvider(DEFAULT_GATEWAY_MODEL, signal);
  }

  private async prepareGatewayProvider(model: string, signal: AbortSignal) {
    const gateway = await nativeAgentGatewayConnection(
      this.account,
      undefined,
      signal
    );
    return {
      provider: {
        ...gateway.launch(model),
        subagents: true as const,
      },
      release: () => gateway.close(),
    };
  }
}

function publicProfile({
  id,
  connection,
  model,
  providerId,
  modelId,
}: NativeChatProfiles.Saved) {
  return {
    id,
    connection,
    model,
    ...(NativeChatProfiles.reasons(providerId, modelId) && {
      reasoning: true as const,
    }),
    // Ultra needs a route whose worker can run the independent reviewer.
    ...((providerId === GG_PROVIDER_ID ||
      NativeProviderSelection.isBuiltInByok(providerId)) && {
      ultra: true as const,
    }),
  };
}

function ordinaryDirectoryIdentity(root: string): WorkspaceDirectoryIdentity {
  try {
    const stat = lstatSync(root, { bigint: true });
    if (stat.isDirectory() && realpathSync.native(root) === root) {
      return {
        device: stat.dev.toString(),
        inode: stat.ino.toString(),
        birthTimeNs: stat.birthtimeNs.toString(),
      };
    }
  } catch {
    // A missing or inaccessible registered directory cannot authorize chat.
  }
  throw new Error("native_workspace_root_changed");
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
