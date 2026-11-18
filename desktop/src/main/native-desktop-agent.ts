// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — native Desktop composition.
// GRIDA-GG: desktop — exact Gateway model and organization for each worker.
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  CHATGPT_PROVIDER_ID,
  GG_PROVIDER_ID,
  isChatGptSubscriptionModelId,
} from "@grida/ai-host";
import { AGENT_DEFAULT_TIER, TIER_MODEL_IDS } from "@grida/ai/catalogue";
import type { Workspace } from "@grida/daemon";
import {
  ProtectedRoots,
  type WorkspaceDirectoryIdentity,
} from "@grida/daemon/server";
import type { NativeChatProfileSelection } from "@grida/desktop-bridge";
import { CHATGPT_SUBSCRIPTION_CONFIG } from "../chatgpt-configuration";
import type { DesktopAccountSession } from "./account-session";
import { servicesSidecarClient } from "./services-sidecar-client";
import {
  nativeAgentGatewayConnection,
  nativeAgentSubscriptionSettings,
} from "./services-sidecar-supervisor";
import {
  createChatGptOAuthCoordinator,
  type ChatGptOAuthCoordinator,
} from "./chatgpt-oauth";
import { NativeChatStore } from "./native-chat-store";
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
import { NativeAgentProcess } from "./native-agent-process";
import type { NativeChatSelections } from "./native-chat-selections";

const executeSelection = promisify(execFile);

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
  /**
   * Title untitled chats from their first request. The app always does; the
   * option keeps scripted test providers free of the extra request.
   */
  chatTitles?: boolean;
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
  /** Catalogue identity survives retiring the default workspace worker. */
  private readonly gatewayScopes = new Map<string, string>();
  private profileWrites = Promise.resolve();
  private hookSettingsOwner?: NativeAgentHooks;

  get globalHooks(): NativeAgentHooks {
    return (this.hookSettingsOwner ??= NativeAgentHooks.settings(
      this.store.hooksHome
    ));
  }

  private constructor(
    private readonly store: NativeChatStore,
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
    private readonly ordinaryWorkspaceChat = false,
    private readonly chatTitles = false
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
      await NativeChatStore.prepareFresh(),
      account,
      resourcesPath,
      options
    );
  }

  static async prepareOrdinary(
    account: DesktopAccountSession,
    resourcesPath: string,
    protectedPaths: readonly string[],
    options: Pick<LaunchOptions, "openExternal" | "onLifecycle" | "chatTitles">
  ) {
    return this.compose(
      await NativeChatStore.prepareOrdinary(protectedPaths),
      account,
      resourcesPath,
      { ...options, provider: "gateway", selectableProfiles: true },
      true
    );
  }

  private static async compose(
    store: NativeChatStore,
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
        ceremony: host,
        open_external: options.openExternal,
      });
      subscription = { host, oauth };
    }
    return new NativeDesktopAgent(
      store,
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
      ordinaryWorkspaceChat,
      options?.chatTitles
    );
  }

  get documentIdentitiesDirectory(): string {
    return this.store.documentIdentitiesDirectory;
  }

  current(workspaceId: string, profileId?: string) {
    if (this.workspaceActivity.get(workspaceId)?.retired) return null;
    return this.owners?.current(workspaceId, profileId) ?? null;
  }

  /** Reuse the workspace's live owner for observation, without activating a route. */
  currentForWindow(workspaceId: string, profileId?: string) {
    return (
      this.current(workspaceId, profileId) ??
      (this.workspaceActivity.get(workspaceId)?.retired
        ? null
        : (this.owners?.catalogOwner(workspaceId) ?? null))
    );
  }

  archiveOwner(workspaceId: string) {
    if (
      this.closed ||
      this.transitions ||
      this.workspaceActivity.get(workspaceId)?.retired
    )
      return null;
    const chat = this.owners?.catalogOwner(workspaceId)?.chat;
    return chat?.archiveCatalog && chat.unarchiveCatalog
      ? {
          archiveCatalog: chat.archiveCatalog.bind(chat),
          unarchiveCatalog: chat.unarchiveCatalog.bind(chat),
        }
      : null;
  }

  archiveDirectory(workspaceId: string, root: string) {
    return this.store.archiveDirectory(workspaceId, root);
  }

  /** Reuse workspace registration/root admission without preparing a provider. */
  archiveWorkspace(workspaceId: string): Promise<{ root: string }> {
    return this.withWorkspace(
      workspaceId,
      async (workspace, requireCurrent) => {
        requireCurrent();
        return { root: workspace.root };
      }
    );
  }

  /** Ground the permission review in the registered directory, without a worker. */
  welcomeWorkspace(workspaceId: string) {
    return this.withWorkspace(workspaceId, async (workspace, check) => {
      check();
      if (!workspace.identity)
        throw new Error("native_chat_permission_mode_unavailable");
      return {
        workspaceId: workspace.id,
        workspaceName: path.basename(workspace.root) || "This project",
        directoryIdentity: workspace.identity,
      };
    });
  }

  async ensure(
    workspaceId: string,
    requireSelection?: () => void
  ): Promise<void> {
    await this.withWorkspace(workspaceId, async (workspace, requireCurrent) => {
      const owners = (this.owners ??= this.newOwners());
      await owners.open(workspace, undefined, () => {
        requireCurrent();
        requireSelection?.();
      });
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
          protected: this.store.protectedPaths,
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
            protected: this.store.protectedPaths,
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
        await servicesSidecarClient.forgetWorkspace(workspaceId);
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
      servicesSidecarClient.nativeBuiltInByok
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
        const directory = await this.store.workspaceDirectory(
          workspace.id,
          workspace.root
        );
        const [choices, saved] = await Promise.all([
          this.availableProfiles(workspace.id),
          NativeChatProfiles.read(directory),
        ]);
        requireCurrent();
        const available = new Set(choices.map(({ id }) => id));
        const defaultWindow = NativeChatProfiles.contextWindow(
          DEFAULT_GATEWAY_MODEL
        );
        return {
          modelChanges: true as const,
          ...subscriptionRecommendation(choices),
          ...(defaultWindow !== undefined && {
            defaultContextWindow: defaultWindow,
          }),
          choices: choices.map(publicProfile),
          saved: saved.map((profile) => {
            // A saved receipt keeps only identity; window facts come from
            // the current choice for the same binding.
            const current = choices.find(({ id }) => id === profile.id);
            return {
              ...publicProfile({
                ...profile,
                contextWindow: current?.contextWindow,
              }),
              available: available.has(profile.id),
            };
          }),
        };
      }
    );
  }

  async selectionChoice(workspaceId: string, profileId: string | null) {
    const local =
      this.owners?.currentDocument(workspaceId)?.chat ??
      this.owners?.currentNestedDeck(workspaceId)?.chat;
    if (local || !this.selectableProfiles) {
      const active = local ?? this.owners?.catalogOwner(workspaceId)?.chat;
      if (profileId !== null || !active?.modelId)
        throw new Error("native_chat_selection_unavailable");
      return { connectionId: null, model: active.modelId };
    }
    return this.withWorkspace(workspaceId, async (_workspace, check) => {
      if (profileId === null)
        return { connectionId: null, model: DEFAULT_GATEWAY_MODEL };
      const choices = await this.availableProfiles(workspaceId);
      check();
      const choice = choices.find(({ id }) => id === profileId);
      if (!choice) throw new Error("native_chat_selection_unavailable");
      return { connectionId: choice.id, model: choice.modelId };
    });
  }

  async initialSelection(workspaceId: string) {
    if (
      !this.selectableProfiles ||
      this.owners?.currentDocument(workspaceId) ||
      this.owners?.currentNestedDeck(workspaceId)
    )
      return {
        ...(await this.selectionChoice(workspaceId, null)),
        fixed: true as const,
      };
    const profiles = await this.profiles(workspaceId);
    return this.selectionChoice(
      workspaceId,
      profiles.recommendedProfileId ?? null
    );
  }

  async legacySelection(
    workspaceId: string,
    legacy: NonNullable<NativeChatSelections.Snapshot["legacy"]>
  ): Promise<NativeChatSelections.Selection | null> {
    const active =
      this.owners?.currentDocument(workspaceId) ??
      this.owners?.currentNestedDeck(workspaceId) ??
      this.currentForWindow(workspaceId);
    if (legacy.matchesCurrent && active?.chat.modelId === legacy.model) {
      return {
        connectionId: active.profileId ?? null,
        model: legacy.model,
        effort: legacy.effort,
      };
    }
    // The native capture names the exact subscription sign-in lineage. This
    // maps identity, never a display label or a currently active account.
    const subscription =
      legacy.principal === legacy.scope && typeof legacy.scope === "string"
        ? /^chatgpt\/subscription\/([a-f0-9]{64})$/.exec(legacy.scope)
        : null;
    if (subscription)
      return {
        connectionId: NativeChatProfiles.subscriptionBinding(
          subscription[1],
          legacy.model
        ),
        model: legacy.model,
        effort: legacy.effort,
      };
    return null;
  }

  async selectionRequest(
    workspaceId: string,
    sessionId: string,
    operation: NativeChatSelections.Operation,
    body: Record<string, unknown> = {}
  ): Promise<unknown> {
    const local =
      this.owners?.currentDocument(workspaceId)?.chat ??
      this.owners?.currentNestedDeck(workspaceId)?.chat;
    if (local) {
      if (!local.selectionRequest)
        throw new Error("native_chat_selection_unsupported");
      return local.selectionRequest(operation, sessionId, body);
    }
    return this.withWorkspace(workspaceId, async (workspace, check) => {
      const active = this.owners?.catalogOwner(workspaceId)?.chat;
      if (active) {
        if (!active.selectionRequest)
          throw new Error("native_chat_selection_unsupported");
        const result = await active.selectionRequest(
          operation,
          sessionId,
          body
        );
        check();
        return result;
      }
      const directory = await this.store.archiveDirectory(
        workspaceId,
        workspace.root
      );
      check();
      if (!directory) throw new Error("native_chat_selection_unavailable");
      const args = [
        "chat-selection",
        "--state-dir",
        directory,
        "--cwd",
        workspace.root,
        "--session",
        sessionId,
        "--operation",
        operation,
      ];
      if (operation !== "inspect")
        args.push(
          "--request-json",
          JSON.stringify({ ...body, cwd: workspace.root, sessionId })
        );
      try {
        const { stdout } = await executeSelection(
          NativeAgentProcess.executable(this.resourcesPath),
          args,
          {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
            windowsHide: true,
            env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
          }
        );
        check();
        return JSON.parse(stdout);
      } catch (error) {
        const stderr = (error as { stderr?: unknown }).stderr;
        const code =
          typeof stderr === "string"
            ? /^grida-agent: (selection_[a-z_]{1,80})$/m.exec(stderr)?.[1]
            : undefined;
        throw new Error(code ?? "native_chat_selection_unavailable");
      }
    });
  }

  /**
   * The choices a Welcome composer can offer before any workspace opens:
   * built-in provider keys and saved endpoints, whose identities do not depend
   * on a workspace. The opened workspace resolves the choice again.
   */
  async welcomeProfiles() {
    this.requireProfiles();
    const { subscription, builtIn, configured } =
      await this.workspaceIndependentProfiles();
    const choices = [...subscription, ...builtIn, ...configured];
    const defaultWindow = NativeChatProfiles.contextWindow(
      DEFAULT_GATEWAY_MODEL
    );
    return {
      modelChanges: true as const,
      ...subscriptionRecommendation(choices),
      ...(defaultWindow !== undefined && {
        defaultContextWindow: defaultWindow,
      }),
      choices: choices.map(publicProfile),
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
      await this.ensure(workspaceId, requireFrame);
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
    const directory = await this.store.workspaceDirectory(
      workspace.id,
      workspace.root
    );
    const profiles =
      selection.kind === "new"
        ? await this.availableProfiles(workspace.id)
        : await NativeChatProfiles.read(directory);
    const profile = profiles.find(({ id }) => id === selection.id);
    if (!profile) throw new Error("native_chat_profile_unavailable");
    if (profile.providerId === CHATGPT_PROVIDER_ID) {
      await this.openSubscriptionProfile(
        workspace,
        profile,
        selection.kind === "new" ? directory : undefined,
        check
      );
      return;
    }
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
      ? servicesSidecarClient.nativeBuiltInByok
      : servicesSidecarClient.nativeConfiguredEndpoint;
    const generation = this.accountGeneration;
    const requireRoute = () => {
      if (this.closed || generation !== this.accountGeneration)
        throw new Error("native_workspace_closing");
      workspace.requireDirectoryCurrent?.();
    };
    const resolve = async () => {
      const launch = await launchProfile(profile.providerId, profile.modelId);
      requireRoute();
      if (builtIn) {
        if (
          NativeChatProfiles.binding(profile.providerId, launch) === profile.id
        )
          return launch;
      } else {
        const configured = NativeChatProfiles.configuredLaunch(launch);
        if (
          NativeChatProfiles.binding(profile.providerId, configured) ===
          profile.id
        )
          return configured;
        const counted = await servicesSidecarClient
          .nativeConfiguredEndpoint(profile.providerId, profile.modelId, true)
          .catch(() => null);
        requireRoute();
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
    check();
    const owners = (this.owners ??= this.newOwners());
    await owners.open(workspace, {
      id: profile.id,
      admit: check,
      ...(selection.kind === "new" && {
        commit: () =>
          this.rememberProfile(workspace, directory, profile, check),
      }),
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

  private async openSubscriptionProfile(
    workspace: SelectedWorkspace,
    profile: NativeChatProfiles.Saved,
    saveDirectory: string | undefined,
    check: () => void
  ) {
    const host = this.subscription?.host;
    if (!host || !isChatGptSubscriptionModelId(profile.modelId))
      throw new Error("native_chat_profile_unavailable");
    const generation = this.accountGeneration;
    const resolve = async (signal?: AbortSignal) => {
      const launch = await host.launch(profile.modelId, signal);
      if (this.closed || generation !== this.accountGeneration)
        throw new Error("native_workspace_closing");
      workspace.requireDirectoryCurrent?.();
      if (
        !launch.subscriptionScope ||
        NativeChatProfiles.subscriptionBinding(
          launch.subscriptionScope,
          profile.modelId
        ) !== profile.id
      )
        throw new Error("native_chat_profile_changed");
      return launch;
    };
    await resolve();
    check();
    const owners = (this.owners ??= this.newOwners());
    await owners.open(workspace, {
      id: profile.id,
      admit: check,
      ...(saveDirectory && {
        commit: () =>
          this.rememberProfile(workspace, saveDirectory, profile, check),
      }),
      prepare: async (signal) => {
        signal.throwIfAborted();
        const current = await resolve(signal);
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
    const models = await servicesSidecarClient
      .listGatewayModels()
      .catch(() => []);
    const model = models.find(({ id }) => id === profile.modelId);
    const maxOutputTokens = NativeChatProfiles.gatewayOutputLimit(model);
    if (
      maxOutputTokens === undefined ||
      profile.modelId === DEFAULT_GATEWAY_MODEL
    )
      throw new Error("native_provider_model_unavailable");
    check();
    const owners = (this.owners ??= this.newOwners());
    const generation = this.accountGeneration;
    const requireRoute = () => {
      if (this.closed || generation !== this.accountGeneration)
        throw new Error("native_workspace_closing");
      workspace.requireDirectoryCurrent?.();
    };
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
      admit: check,
      ...(saveDirectory && {
        commit: () =>
          this.rememberProfile(workspace, saveDirectory, profile, check),
      }),
      prepare: async (signal) => {
        requireRoute();
        signal.throwIfAborted();
        const { provider, release } = await this.prepareGatewayProvider(
          profile.modelId,
          signal
        );
        try {
          requireRoute();
          signal.throwIfAborted();
          requireScope(provider.gatewayScope);
          if (provider.gatewayScope)
            this.gatewayScopes.set(workspace.id, provider.gatewayScope);
          const launch = await this.workspaceLaunch(workspace, provider);
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
      await this.store.workspaceDirectory(workspace.id, workspace.root, true);
      await NativeChatProfiles.remember(directory, profile, check);
    });
    this.profileWrites = publish.catch(() => {});
    await publish;
  }

  private requireProfiles(): void {
    if (!this.selectableProfiles)
      throw new Error("native_chat_profiles_unavailable");
  }

  private async workspaceIndependentProfiles() {
    const [subscription, builtIn, configured] = await Promise.all([
      this.subscriptionProfiles(),
      NativeChatProfiles.builtInChoices(
        servicesSidecarClient.nativeBuiltInByok
      ),
      servicesSidecarClient
        .listProviderEndpoints()
        .then((endpoints) =>
          NativeChatProfiles.configuredChoices(
            endpoints,
            servicesSidecarClient.nativeConfiguredEndpoint
          )
        ),
    ]);
    return { subscription, builtIn, configured };
  }

  private async subscriptionProfiles(): Promise<NativeChatProfiles.Saved[]> {
    if (!this.subscription || this.closed || this.transitions > 0) return [];
    const generation = this.accountGeneration;
    // Capture checks the stored connection without refreshing credentials or
    // sending inference. Execution recaptures and verifies the same lineage.
    const launch = await this.subscription.host
      .launch(CHATGPT_SUBSCRIPTION_CONFIG.default_model_id)
      .catch(() => null);
    if (
      !launch?.subscriptionScope ||
      this.closed ||
      generation !== this.accountGeneration
    )
      return [];
    return NativeChatProfiles.subscriptionChoices(launch.subscriptionScope);
  }

  private async availableProfiles(workspaceId: string) {
    const generation = this.accountGeneration;
    const gatewayScope =
      this.owners?.gatewayScope(workspaceId) ??
      this.gatewayScopes.get(workspaceId);
    const [{ subscription, builtIn, configured }, gateway] = await Promise.all([
      this.workspaceIndependentProfiles(),
      gatewayScope
        ? servicesSidecarClient
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
    return [
      ...subscription,
      ...(generation === this.accountGeneration &&
      gatewayScope ===
        (this.owners?.gatewayScope(workspaceId) ??
          this.gatewayScopes.get(workspaceId))
        ? gateway
        : []),
      ...builtIn,
      ...configured,
    ];
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
        : await servicesSidecarClient.findWorkspace(workspaceId);
      requireCurrent();
      if (workspace?.id !== workspaceId)
        throw new Error("native_workspace_not_registered");
      if (!this.ordinaryWorkspaceChat)
        return await use(workspace, requireCurrent);
      const identity = ordinaryDirectoryIdentity(workspace.root);
      if (
        new ProtectedRoots(this.store.protectedPaths).overlaps(workspace.root)
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
    this.gatewayScopes.clear();
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
      this.store,
      async (workspace, signal) => {
        const { provider, release } = await this.prepareProvider(signal);
        try {
          if (
            "gatewayScope" in provider &&
            provider.gatewayScope &&
            !signal.aborted
          )
            this.gatewayScopes.set(workspace.id, provider.gatewayScope);
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
            directory: await this.store.workspaceDirectory(id, root, true),
            epoch: this.configurationEpoch,
          }
        : undefined;
    const imageTools =
      "imageGeneration" in provider &&
      provider.imageGeneration &&
      identity &&
      !nestedProtectedPaths;
    // Gateway launches carry their own allowance; a subscription route
    // takes none.
    const explicit =
      "maxOutputTokens" in provider &&
      typeof provider.maxOutputTokens === "number"
        ? provider.maxOutputTokens
        : undefined;
    const scoped =
      ("gatewayScope" in provider && provider.gatewayScope !== undefined) ||
      ("subscriptionScope" in provider &&
        provider.subscriptionScope !== undefined);
    const maxOutputTokens =
      explicit ??
      (scoped ? undefined : NativeChatProfiles.outputLimit(provider.model));
    return {
      ...provider,
      subagents: true as const,
      ...(maxOutputTokens !== undefined && { maxOutputTokens }),
      ...(this.chatTitles && { chatTitles: true as const }),
      imagePlacement: imageTools
        ? this.imagePlacement?.({ workspaceId: id, root, identity })
        : undefined,
      reviewImageReference: imageTools
        ? this.reviewImageReference?.({ id, root })
        : undefined,
      workspaceConfiguration,
      hooks: workspaceConfiguration
        ? await NativeAgentHooks.open(this.store.hooksHome, root)
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
          ...this.store.protectedPaths,
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
          ? await servicesSidecarClient.nativeBuiltInByok(id, model)
          : await servicesSidecarClient.nativeConfiguredEndpoint(id, model);
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

function subscriptionRecommendation(
  choices: readonly NativeChatProfiles.Saved[]
) {
  const recommendedProfileId = choices.find(
    (choice) =>
      choice.providerId === CHATGPT_PROVIDER_ID &&
      choice.modelId === CHATGPT_SUBSCRIPTION_CONFIG.default_model_id
  )?.id;
  return recommendedProfileId ? { recommendedProfileId } : {};
}

function publicProfile({
  id,
  connection,
  model,
  providerId,
  modelId,
  contextWindow,
}: NativeChatProfiles.Saved) {
  const window =
    contextWindow ?? NativeChatProfiles.contextWindow(modelId, providerId);
  return {
    id,
    connection,
    model,
    ...(NativeChatProfiles.imageInput(providerId, modelId) && {
      imageInput: true as const,
    }),
    ...(window !== undefined && { contextWindow: window }),
    ...((providerId === CHATGPT_PROVIDER_ID ||
      NativeChatProfiles.reasons(providerId, modelId)) && {
      reasoning: true as const,
    }),
    // The native harness owns independent review on every model connection.
    ultra: true as const,
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
