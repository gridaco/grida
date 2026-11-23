// GRIDA-SEC-004 / GRIDA-SEC-006 / GRIDA-SEC-008 — native Desktop composition.
// GRIDA-GG: desktop — exact Gateway model and organization for each worker.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  CHATGPT_PROVIDER_ID,
  GG_PROVIDER_ID,
  isValidEndpointProviderId,
  type ChatGptTurnCapabilities,
} from "@grida/ai-host";
import {
  AGENT_DEFAULT_TIER,
  TIER_MODEL_IDS,
  ChatModels,
  bundledModelCatalogue,
} from "@grida/ai/catalogue";
import type { ModelCatalogueSnapshot } from "@grida/ai/model-catalogue";
import { OPENAI_PROJECT_PROVIDER_ID } from "@grida/ai/providers";
import type { Workspace } from "@grida/daemon";
import {
  ProtectedRoots,
  type WorkspaceDirectoryIdentity,
} from "@grida/daemon/server";
import type {
  NativeChatProfileCatalog,
  NativeChatProfileSelection,
} from "@grida/desktop-bridge";
import { CHATGPT_SUBSCRIPTION_CONFIG } from "../chatgpt-configuration";
import type { DesktopAccountSession } from "./account-session";
import { servicesSidecarClient } from "./services-sidecar-client";
import {
  nativeAgentGatewayConnection,
  nativeAgentOpenAiOffer,
  nativeAgentSubscriptionSettings,
} from "./services-sidecar-supervisor";
import {
  createChatGptOAuthCoordinator,
  type ChatGptOAuthCoordinator,
} from "./chatgpt-oauth";
import { NativeChatStore } from "./native-chat-store";
import type { ActiveNativeChat } from "./native-chat-ipc";
import type { NativeChatGptHost } from "./native-chatgpt-host";
import type { ModelCatalogueStore } from "@grida/ai-host/model-catalogue";
import { NativeChatProfiles } from "./native-chat-profiles";
import type { NativeDesktopProfile } from "./native-desktop-profile";
import type { NativeImagePlacement } from "./native-image-placement";
import type { ImageReferenceReview } from "./native-image-generation";
import type { NativeMcpLaunch } from "./native-mcp-launch";
import { NativeProviderSelection } from "./native-provider-selection";
import { DesktopPersonalization } from "./desktop-personalization";
import { NativePredictionRoute } from "./native-prediction-route";
import {
  NativeDeckGrant,
  type NativeNestedDeckGrant,
} from "./native-workspace-catalog";
import { NativeWorkspaceAgents } from "./native-workspace-agents";
import type {
  NativeProviderRoutes,
  NativeProviderRouteLaunch,
  PreparedProviderRoute,
} from "./native-provider-routes";
import { NativeAgentHooks } from "./native-agent-hooks";
import { NativeAgentConfig } from "./native-agent-config";
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
type ProviderProfile = {
  id: string;
  model: string;
  binding?: NativeProviderRouteLaunch;
  prepare(signal: AbortSignal): Promise<PreparedProviderRoute>;
  commit?(): Promise<void>;
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
  modelCatalogue?: Pick<ModelCatalogueStore, "view">;
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
  private readonly workspaceActivity = new Map<string, WorkspaceActivity>();
  /** Catalogue identity survives retiring the default workspace worker. */
  private readonly gatewayScopes = new Map<string, string>();
  private profileWrites = Promise.resolve();
  private hookSettingsOwner?: NativeAgentHooks;

  get globalHooks(): NativeAgentHooks {
    return (this.hookSettingsOwner ??= NativeAgentHooks.settings(
      this.store.configHome,
      this.config
    ));
  }

  private constructor(
    private readonly store: NativeChatStore,
    private readonly account: DesktopAccountSession,
    private readonly resourcesPath: string,
    private readonly config: NativeAgentConfig,
    readonly personalization: DesktopPersonalization,
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
    private readonly chatTitles = false,
    private readonly modelCatalogue?: LaunchOptions["modelCatalogue"]
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
    options: Pick<
      LaunchOptions,
      "openExternal" | "onLifecycle" | "chatTitles" | "modelCatalogue"
    >
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
    const config = new NativeAgentConfig(store.configHome, () =>
      NativeAgentProcess.executable(resourcesPath)
    );
    const personalization = new DesktopPersonalization(
      path.join(store.configHome, "config.toml"),
      config
    );
    let subscription: Subscription | undefined;
    if (options && (options.provider === "chatgpt" || ordinaryWorkspaceChat)) {
      const { userDataPath, network } = await nativeAgentSubscriptionSettings();
      const { NativeChatGptHost } = await import("./native-chatgpt-host");
      const host = new NativeChatGptHost(userDataPath, network, () =>
        personalization.getPersonalization().then(
          ({ webSearch }) => ({
            webSearchAllowed: webSearch !== "disabled",
          }),
          () => ({ webSearchAllowed: false })
        )
      );
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
      config,
      personalization,
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
      options?.chatTitles,
      options?.modelCatalogue
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

  get catalogRegistryDirectory() {
    return this.store.catalogRegistryDirectory;
  }

  catalogLocation(id: string) {
    return this.withWorkspace(id, async (workspace, check) => {
      const stateDir = await this.store.workspaceDirectory(id, workspace.root);
      check();
      return { id, cwd: workspace.root, stateDir };
    });
  }

  onCatalogReset?: (shutdown: boolean) => Promise<void>;

  get catalogGeneration(): number {
    return this.accountGeneration;
  }

  /** The live worker or one closed-store command owns a workspace store at a time. */
  withCatalogStore<T>(
    workspaceId: string,
    expectedRoot: string | undefined,
    use: (
      chat: ActiveNativeChat["chat"] | null,
      directory: string | null,
      root: string
    ) => Promise<T>
  ): Promise<T> {
    return this.withWorkspace(workspaceId, async (workspace, check) => {
      if (expectedRoot !== undefined && workspace.root !== expectedRoot)
        throw new Error("native_chat_catalog_workspace_changed");
      const owners = (this.owners ??= this.newOwners());
      const result = await owners.readCatalog(workspaceId, async (active) => {
        const directory = active
          ? null
          : await this.store.existingWorkspaceDirectory(
              workspaceId,
              workspace.root
            );
        check();
        return use(active?.chat ?? null, directory, workspace.root);
      });
      check();
      return result;
    });
  }

  /** Reuse workspace registration/root admission without preparing a provider. */
  catalogWorkspace(workspaceId: string): Promise<{ root: string }> {
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
      this.modelFacts(),
      servicesSidecarClient.nativeBuiltInByok
    );
    return (
      builtIn.find((choice) => choice.modelId === DEFAULT_GATEWAY_MODEL)?.id ??
      builtIn[0]?.id ??
      null
    );
  }

  async turnCapabilities(
    workspaceId: string,
    profileId: string | null,
    model: string
  ): Promise<ChatGptTurnCapabilities> {
    const unsupported = {
      status: "unsupported",
      speeds: [],
      webSearch: false,
    } as const;
    if (!profileId || !this.subscription) return unsupported;
    return this.withWorkspace(workspaceId, async (_workspace, check) => {
      try {
        const binding = await this.subscriptionLaunch(
          model,
          undefined,
          profileId
        );
        check();
        const offer = await binding.subscriptionCapabilities();
        check();
        return offer;
      } catch (error) {
        check();
        const code =
          error instanceof Error
            ? "code" in error
              ? error.code
              : error.message
            : undefined;
        if (
          code === "native_chat_profile_changed" ||
          code === "native_chat_profile_unavailable" ||
          code === "chatgpt_not_signed_in" ||
          code === "chatgpt_credential_changed"
        )
          return unsupported;
        const status =
          code === "chatgpt_reauthentication_required"
            ? "reauthenticationRequired"
            : "unavailable";
        return { status, speeds: [], webSearch: false } as const;
      }
    });
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
        const [{ choices, subscriptionIssue, openAiIssue }, saved] =
          await Promise.all([
            this.availableProfiles(workspace.id),
            NativeChatProfiles.read(directory),
          ]);
        requireCurrent();
        const savedProfiles = await Promise.all(
          saved.map(async (profile) => {
            // A saved receipt keeps only identity; window facts come from
            // the current choice or the exact retained connection.
            const current = choices.find(({ id }) => id === profile.id);
            if (current) return { ...publicProfile(current), available: true };
            const legacy = await this.legacyConfiguredLaunch(
              profile,
              requireCurrent
            );
            return {
              ...publicProfile({
                ...profile,
                connection: profile.connection.replace(
                  / \(llama\.cpp counting\)?$/u,
                  " (legacy)"
                ),
                contextWindow: legacy?.contextWindowTokens,
              }),
              available: !!legacy,
            };
          })
        );
        requireCurrent();
        const defaultWindow = NativeChatProfiles.contextWindow(
          DEFAULT_GATEWAY_MODEL
        );
        return {
          modelChanges: true as const,
          ...(this.provider === "gateway" && {
            defaultGoalSpending: true as const,
          }),
          ...(subscriptionIssue && { subscriptionIssue }),
          ...(openAiIssue && { openAiIssue }),
          ...subscriptionRecommendation(choices),
          ...(defaultWindow !== undefined && {
            defaultContextWindow: defaultWindow,
          }),
          choices: choices.map(publicProfile),
          saved: savedProfiles,
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
    return this.withWorkspace(workspaceId, async (workspace, check) => {
      if (profileId === null)
        return { connectionId: null, model: DEFAULT_GATEWAY_MODEL };
      const { choices } = await this.availableProfiles(workspaceId);
      check();
      const choice = choices.find(({ id }) => id === profileId);
      if (choice) return { connectionId: choice.id, model: choice.modelId };
      const directory = await this.store.workspaceDirectory(
        workspace.id,
        workspace.root
      );
      const saved = (await NativeChatProfiles.read(directory)).find(
        ({ id }) => id === profileId
      );
      check();
      if (saved && (await this.legacyConfiguredLaunch(saved, check)))
        return { connectionId: saved.id, model: saved.modelId };
      throw new Error("native_chat_selection_unavailable");
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
    return this.withCatalogStore(
      workspaceId,
      undefined,
      async (active, directory, root) => {
        if (active) {
          if (!active.selectionRequest)
            throw new Error("native_chat_selection_unsupported");
          return active.selectionRequest(operation, sessionId, body);
        }
        if (!directory) throw new Error("native_chat_selection_unavailable");
        const args = [
          "chat-selection",
          "--state-dir",
          directory,
          "--cwd",
          root,
          "--session",
          sessionId,
          "--operation",
          operation,
        ];
        if (operation !== "inspect")
          args.push(
            "--request-json",
            JSON.stringify({ ...body, cwd: root, sessionId })
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
          return JSON.parse(stdout);
        } catch (error) {
          const stderr = (error as { stderr?: unknown }).stderr;
          const code =
            typeof stderr === "string"
              ? /^grida-agent: (selection_[a-z_]{1,80})$/m.exec(stderr)?.[1]
              : undefined;
          throw new Error(code ?? "native_chat_selection_unavailable");
        }
      }
    );
  }

  /**
   * The choices a Welcome composer can offer before any workspace opens:
   * built-in provider keys and saved endpoints, whose identities do not depend
   * on a workspace. The opened workspace resolves the choice again.
   */
  async welcomeProfiles() {
    this.requireProfiles();
    const { subscription, builtIn, configured, openAiIssue } =
      await this.workspaceIndependentProfiles();
    const { subscriptionIssue } = subscription;
    const choices = [...subscription.choices, ...builtIn, ...configured];
    const defaultWindow = NativeChatProfiles.contextWindow(
      DEFAULT_GATEWAY_MODEL
    );
    return {
      modelChanges: true as const,
      ...(this.provider === "gateway" && {
        defaultGoalSpending: true as const,
      }),
      ...(subscriptionIssue && { subscriptionIssue }),
      ...(openAiIssue && { openAiIssue }),
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
    await this.withWorkspace(workspaceId, async (workspace, requireCurrent) => {
      const check = () => {
        requireCurrent();
        requireFrame();
      };
      const profile = await this.providerProfile(workspace, selection, check);
      const owners = (this.owners ??= this.newOwners());
      await owners.open(workspace, {
        ...profile,
        admit: check,
        prepare: async (signal) => {
          const { launch, release } = await profile.prepare(signal);
          try {
            return {
              launch: {
                ...(await this.workspaceLaunch(workspace, launch)),
                ...(launch.gatewayScope && {
                  mcp: this.mcp?.forWorkspace(workspace.root),
                }),
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
            release?.();
            throw error;
          }
        },
      });
      check();
    });
  }

  private async providerProfile(
    workspace: SelectedWorkspace,
    selection: { kind: "new" | "saved" | "capture"; id: string },
    check: () => void,
    retained?: ChatModels.Retained
  ): Promise<ProviderProfile> {
    check();
    const directory = await this.store.workspaceDirectory(
      workspace.id,
      workspace.root
    );
    const saved =
      selection.kind !== "new"
        ? (await NativeChatProfiles.read(directory)).find(
            ({ id }) => id === selection.id
          )
        : undefined;
    const matchesSelection = ({ id }: NativeChatProfiles.Saved) =>
      id === selection.id;
    let profile = saved;
    if (!profile && selection.kind !== "saved") {
      const { choices, openAiIssue } = await this.availableProfiles(
        workspace.id
      );
      profile = choices.find(matchesSelection);
      // A previously shown OpenAI choice can be selected during a refresh.
      // Resolve it against the current offer after looking for other providers.
      if (!profile && openAiIssue === "loading") {
        const { builtIn } = await this.builtInProfiles(this.modelFacts(), true);
        profile = builtIn.find(matchesSelection);
      }
    }
    const saveDirectory = !saved ? directory : undefined;
    if (!profile) throw new Error("native_chat_profile_unavailable");
    if (profile.providerId === CHATGPT_PROVIDER_ID) {
      return this.subscriptionProfile(
        workspace,
        profile,
        saveDirectory,
        check,
        retained
      );
    }
    if (profile.providerId === GG_PROVIDER_ID) {
      return this.gatewayProfile(workspace, profile, saveDirectory, check);
    }
    const builtIn = NativeProviderSelection.isBuiltInByok(profile.providerId);
    const generation = this.accountGeneration;
    const requireRoute = () => {
      if (this.closed || generation !== this.accountGeneration)
        throw new Error("native_workspace_closing");
      workspace.requireDirectoryCurrent?.();
    };
    const resolve = async () => {
      if (builtIn) {
        const launch = await this.byokLaunch(
          profile.providerId,
          profile.modelId,
          retained
        );
        requireRoute();
        if (
          NativeChatProfiles.binding(profile.providerId, launch) === profile.id
        )
          return launch;
      } else {
        const launch =
          (await NativeChatProfiles.resolveConfigured(
            profile,
            servicesSidecarClient.nativeConfiguredEndpoint,
            requireRoute
          )) ??
          (saved && (await this.legacyConfiguredLaunch(saved, requireRoute)));
        if (launch) return launch;
      }
      throw new Error("native_chat_profile_changed");
    };
    const binding = await resolve();
    check();
    return {
      binding,
      id: profile.id,
      model: profile.modelId,
      ...(saveDirectory && {
        commit: () =>
          this.rememberProfile(workspace, saveDirectory, profile, check),
      }),
      prepare: async (signal) => {
        signal.throwIfAborted();
        // Settings or an approval may have changed while publishing the receipt.
        const current = await resolve();
        signal.throwIfAborted();
        return { launch: current };
      },
    };
  }

  private async legacyConfiguredLaunch(
    profile: NativeChatProfiles.Saved,
    requireCurrent: () => void
  ) {
    // Only an existing workspace receipt can reopen this obsolete binding.
    if (!isValidEndpointProviderId(profile.providerId)) return;
    const launch = await NativeChatProfiles.resolveConfigured(
      profile,
      servicesSidecarClient.nativeConfiguredEndpoint,
      requireCurrent,
      true
    ).catch(() => undefined);
    requireCurrent();
    return launch;
  }

  private async subscriptionProfile(
    workspace: SelectedWorkspace,
    profile: NativeChatProfiles.Saved,
    saveDirectory: string | undefined,
    check: () => void,
    retained?: ChatModels.Retained
  ): Promise<ProviderProfile> {
    const generation = this.accountGeneration;
    const resolve = async (signal?: AbortSignal) => {
      const launch = await this.subscriptionLaunch(
        profile.modelId,
        signal,
        profile.id,
        retained
      );
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
    const binding = await resolve();
    check();
    return {
      binding,
      id: profile.id,
      model: profile.modelId,
      ...(saveDirectory && {
        commit: () =>
          this.rememberProfile(workspace, saveDirectory, profile, check),
      }),
      prepare: async (signal) => {
        signal.throwIfAborted();
        const current = await resolve(signal);
        signal.throwIfAborted();
        return { launch: current };
      },
    };
  }

  private async gatewayProfile(
    workspace: SelectedWorkspace,
    profile: NativeChatProfiles.Saved,
    saveDirectory: string | undefined,
    check: () => void
  ): Promise<ProviderProfile> {
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
    return {
      id: profile.id,
      model: profile.modelId,
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
          return {
            launch: {
              ...provider,
              contextWindowTokens:
                NativeChatProfiles.gatewayContextWindow(model),
              maxOutputTokens,
            },
            release,
          };
        } catch (error) {
          release();
          throw error;
        }
      },
    };
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
    const snapshot = this.modelFacts();
    const [subscription, { builtIn, openAiIssue }, configured] =
      await Promise.all([
        this.subscriptionProfiles(snapshot),
        this.builtInProfiles(snapshot),
        servicesSidecarClient
          .listProviderEndpoints()
          .then((endpoints) =>
            NativeChatProfiles.configuredChoices(
              endpoints,
              servicesSidecarClient.nativeConfiguredEndpoint
            )
          ),
      ]);
    return { subscription, builtIn, configured, openAiIssue };
  }

  private async builtInProfiles(
    snapshot: ModelCatalogueSnapshot,
    waitForOpenAi = false
  ) {
    const offer = await nativeAgentOpenAiOffer(waitForOpenAi).catch(
      () => ({ status: "unavailable" }) as const
    );
    const models =
      offer.status === "ready"
        ? ChatModels.list(snapshot, {
            provider: "openai",
            models: offer.models,
          })
        : [];
    const builtIn = await NativeChatProfiles.builtInChoices(
      snapshot,
      servicesSidecarClient.nativeBuiltInByok,
      models
    );
    let openAiIssue: NativeChatProfileCatalog["openAiIssue"];
    if (offer.status === "ready") {
      if (!(await offer.isCurrent().catch(() => false))) {
        return {
          builtIn: builtIn.filter(
            ({ providerId }) => providerId !== OPENAI_PROJECT_PROVIDER_ID
          ),
          openAiIssue: "unavailable" as const,
        };
      }
      if (models.length === 0) openAiIssue = "noCompatibleModels";
      else if (
        !builtIn.some(
          ({ providerId }) => providerId === OPENAI_PROJECT_PROVIDER_ID
        )
      )
        openAiIssue = "unavailable";
    } else if (offer.status !== "missing") {
      openAiIssue = offer.status;
    }
    return { builtIn, openAiIssue };
  }

  private async subscriptionProfiles(
    snapshot: ModelCatalogueSnapshot
  ): Promise<{
    choices: NativeChatProfiles.Saved[];
    subscriptionIssue?: "unavailable" | "reauthenticationRequired";
  }> {
    if (!this.subscription || this.closed || this.transitions > 0)
      return { choices: [] };
    const generation = this.accountGeneration;
    const host = this.subscription.host;
    const status = await host.status().catch(() => undefined);
    if (!status) return { choices: [], subscriptionIssue: "unavailable" };
    if (
      !status.signed_in ||
      generation !== this.accountGeneration ||
      this.closed
    )
      return { choices: [] };
    const offer = await host.inventory();
    if (this.closed || generation !== this.accountGeneration)
      return { choices: [] };
    if (offer.status !== "available")
      return { choices: [], subscriptionIssue: offer.status };
    return {
      choices: NativeChatProfiles.subscriptionChoices(
        offer.scope,
        ChatModels.list(snapshot, {
          provider: "chatgpt",
          selectors: offer.selectors,
        })
      ),
    };
  }

  private modelFacts() {
    return this.modelCatalogue?.view() ?? bundledModelCatalogue();
  }

  private async byokLaunch(
    provider: string,
    model: string,
    retained?: ChatModels.Retained
  ) {
    if (!NativeProviderSelection.isBuiltInByok(provider))
      throw new Error("native_provider_byok_unavailable");
    const snapshot = this.modelFacts();
    if (provider === OPENAI_PROJECT_PROVIDER_ID) {
      const offer = retained ? undefined : await nativeAgentOpenAiOffer();
      const binding = retained
        ? ChatModels.resume(snapshot, { provider: "openai" }, model, retained)
        : offer?.status === "ready"
          ? ChatModels.resolve(
              snapshot,
              { provider: "openai", models: offer.models },
              model
            )
          : undefined;
      if (!binding) throw new Error("native_chat_profile_unavailable");
      const launch = await servicesSidecarClient.nativeBuiltInByok(
        provider,
        model,
        binding,
        snapshot
      );
      if (offer?.status === "ready" && !(await offer.isCurrent()))
        throw new Error("native_chat_profile_unavailable");
      return launch;
    }
    const binding = retained
      ? ChatModels.resume(snapshot, { provider }, model, retained)
      : ChatModels.resolve(snapshot, { provider }, model);
    if (!binding) throw new Error("native_chat_profile_unavailable");
    return servicesSidecarClient.nativeBuiltInByok(
      provider,
      model,
      binding,
      snapshot
    );
  }

  private async subscriptionLaunch(
    modelId: string,
    signal?: AbortSignal,
    profileId?: string,
    retained?: ChatModels.Retained
  ) {
    const host = this.subscription?.host;
    if (!host) throw new Error("native_chat_profile_unavailable");
    const scope = await host.scope();
    if (
      profileId &&
      NativeChatProfiles.subscriptionBinding(scope, modelId) !== profileId
    )
      throw new Error("native_chat_profile_changed");
    const offer = await host.inventory();
    if (offer.status !== "available")
      throw new Error(
        offer.status === "reauthenticationRequired"
          ? "chatgpt_reauthentication_required"
          : "chat_turn_capabilities_unavailable"
      );
    if (offer.scope !== scope) throw new Error("native_chat_profile_changed");
    const facts = this.modelFacts();
    const connection = {
      provider: "chatgpt",
      selectors: offer.selectors,
    } as const;
    const binding = retained
      ? ChatModels.resume(facts, connection, modelId, retained)
      : ChatModels.resolve(facts, connection, modelId);
    if (!binding) throw new Error("native_chat_profile_unavailable");
    return {
      ...(await host.launch(modelId, signal, {
        scope,
        wireModel: binding.wireModel,
        speeds: binding.speeds,
      })),
      imageInput: binding.imageInput,
      contextWindowTokens: binding.contextWindow,
      subscriptionSpeeds: binding.speeds,
    };
  }

  private async availableProfiles(workspaceId: string) {
    const generation = this.accountGeneration;
    const gatewayScope =
      this.owners?.gatewayScope(workspaceId) ??
      this.gatewayScopes.get(workspaceId);
    const [{ subscription, builtIn, configured, openAiIssue }, gateway] =
      await Promise.all([
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
    return {
      subscriptionIssue: subscription.subscriptionIssue,
      openAiIssue,
      choices: [
        ...subscription.choices,
        ...(generation === this.accountGeneration &&
        gatewayScope ===
          (this.owners?.gatewayScope(workspaceId) ??
            this.gatewayScopes.get(workspaceId))
          ? gateway
          : []),
        ...builtIn,
        ...configured,
      ],
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
    const catalogClosed = this.onCatalogReset?.(this.closed);
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
    // A catalog read may itself be waiting for the workspace transition.
    return Promise.all([result, catalogClosed]).then(([value]) => value);
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
                lookupPredictionRoute: this.predictionRouteLookup(
                  workspace.id,
                  workspace.requireCurrent
                ),
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

  private providerLimits(
    provider: NativeProviderRouteLaunch
  ): NativeProviderRouteLaunch {
    const maxOutputTokens =
      provider.maxOutputTokens ??
      (provider.gatewayScope || provider.subscriptionScope || provider.wireModel
        ? undefined
        : NativeChatProfiles.outputLimit(provider.model));
    return {
      ...provider,
      ...(maxOutputTokens !== undefined && { maxOutputTokens }),
    };
  }

  private async workspaceLaunch(
    workspace: SelectedWorkspace,
    provider: NativeProviderRouteLaunch,
    nestedProtectedPaths?: readonly string[]
  ) {
    const { id, root, identity } = workspace;
    const useWorkspaceServices =
      this.selectableProfiles && !nestedProtectedPaths;
    return {
      ...this.providerLimits(provider),
      imagePlacement:
        identity &&
        !nestedProtectedPaths &&
        (provider.imageGeneration || useWorkspaceServices)
          ? this.imagePlacement?.({ workspaceId: id, root, identity })
          : undefined,
      reviewImageReference:
        identity &&
        !nestedProtectedPaths &&
        (provider.imageGeneration || useWorkspaceServices)
          ? this.reviewImageReference?.({ id, root })
          : undefined,
      subagents: true as const,
      ...(this.chatTitles && { chatTitles: true as const }),
      lookupPredictionRoute: this.predictionRouteLookup(
        id,
        workspace.requireDirectoryCurrent
      ),
      ...(useWorkspaceServices && {
        lookupProviderRoute: this.inputRouteLookup(workspace),
      }),
      hooks: useWorkspaceServices
        ? await NativeAgentHooks.open(this.store.configHome, root)
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
        ...(!nestedProtectedPaths && { allowScopedAccess: true as const }),
        protectedPaths: [
          ...this.store.protectedPaths,
          ...(this.workspaceCatalogRoot ? [this.workspaceCatalogRoot] : []),
          ...(nestedProtectedPaths ?? []),
        ],
      },
    };
  }

  private predictionRouteLookup(
    workspaceId: string,
    requireCurrent?: () => void
  ): NativeProviderRoutes.PredictionLookup {
    const generation = this.accountGeneration;
    return async (source, signal) => {
      const check = () => {
        signal.throwIfAborted();
        if (
          this.closed ||
          this.transitions ||
          this.accountGeneration !== generation ||
          this.workspaceActivity.get(workspaceId)?.retired
        )
          throw new Error("native_workspace_closing");
        requireCurrent?.();
      };
      check();
      const host = this.subscription?.host;
      const target = await NativePredictionRoute.resolve(source, signal, {
        subscription: host
          ? (model, signal) =>
              this.subscriptionLaunch(
                model,
                signal,
                NativeChatProfiles.subscriptionBinding(
                  source.subscriptionScope!,
                  model
                )
              )
          : undefined,
        snapshot: this.modelFacts(),
        endpoints: servicesSidecarClient.listProviderEndpoints,
        gateway: servicesSidecarClient.listGatewayModels,
      });
      if (target) await this.store.requireProviderIsolation(target);
      check();
      return target;
    };
  }

  private inputRouteLookup(
    workspace: SelectedWorkspace
  ): NativeProviderRoutes.Lookup {
    const generation = this.accountGeneration;
    return async (connectionId, model, signal, retained) => {
      const check = () => {
        signal.throwIfAborted();
        if (
          this.closed ||
          generation !== this.accountGeneration ||
          this.workspaceActivity.get(workspace.id)?.retired
        )
          throw new Error("native_workspace_closing");
        workspace.requireDirectoryCurrent?.();
      };
      check();
      const profile =
        connectionId !== null
          ? await this.providerProfile(
              workspace,
              { kind: "capture", id: connectionId },
              check,
              retained
            )
          : undefined;
      check();
      if (
        (profile && profile.model !== model) ||
        (!profile &&
          this.provider === "gateway" &&
          model !== DEFAULT_GATEWAY_MODEL)
      )
        throw new Error("native_chat_profile_changed");
      return {
        binding: profile?.binding,
        prepare: async () => {
          const prepared: PreparedProviderRoute = profile
            ? await profile.prepare(signal)
            : await this.prepareProvider(signal).then(
                ({ provider, release }) => ({
                  launch: provider,
                  release,
                })
              );
          try {
            check();
            await this.store.requireProviderIsolation(prepared.launch);
            check();
            if (prepared.launch.model !== model)
              throw new Error("native_chat_profile_changed");
            await profile?.commit?.();
            check();
            return {
              ...prepared,
              launch: this.providerLimits(prepared.launch),
            };
          } catch (error) {
            prepared.release?.();
            throw error;
          }
        },
      };
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
          ? await this.byokLaunch(id, model)
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
        ...(model === DEFAULT_GATEWAY_MODEL && {
          contextWindowTokens: NativeChatProfiles.contextWindow(model),
        }),
        subagents: true as const,
      },
      release: () => gateway.close(),
    };
  }
}

function subscriptionRecommendation(
  choices: readonly NativeChatProfiles.Saved[]
) {
  const recommendedProfileId =
    choices.find(
      (choice) =>
        choice.providerId === CHATGPT_PROVIDER_ID &&
        choice.modelId === CHATGPT_SUBSCRIPTION_CONFIG.default_model_id
    )?.id ??
    choices.find((choice) => choice.providerId === CHATGPT_PROVIDER_ID)?.id;
  return recommendedProfileId ? { recommendedProfileId } : {};
}

function publicProfile({
  id,
  connection,
  model,
  providerId,
  modelId,
  contextWindow,
  imageInput,
  reasoning,
}: NativeChatProfiles.Saved) {
  return {
    id,
    connection,
    model,
    ...(providerId === GG_PROVIDER_ID && { goalSpending: true as const }),
    ...((imageInput ||
      (providerId === GG_PROVIDER_ID &&
        NativeChatProfiles.gatewayImageInput(modelId))) && {
      imageInput: true as const,
    }),
    ...(contextWindow !== undefined && { contextWindow }),
    ...((reasoning ||
      (providerId === GG_PROVIDER_ID &&
        NativeChatProfiles.reasons(providerId, modelId))) && {
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
