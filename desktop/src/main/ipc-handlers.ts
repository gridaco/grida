// GRIDA-SEC-008 — ChatGPT operations are registered through guarded IPC only.
import {
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import path from "node:path";
import { URL } from "node:url";
import type { RecentStore } from "@grida/daemon/server";
import {
  IPC_CHANNELS,
  type ConfirmOptions,
  type IpcChannel,
  type NavigationState,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from "../bridge/contract";
import { EDITOR_BASE_URL } from "../env";
import { isSafeExternalUrl } from "../window";
import { agentSidecarClient } from "./agent-sidecar-client";
import {
  approveAgentProviderEndpoint,
  describeAgentProviderEndpoint,
  getAgentSidecarInfo,
  revokeAgentProviderEndpoint,
  withTemporaryAgentProviderEndpoint,
} from "./agent-sidecar-supervisor";
import { AgentProviderEndpointMutation } from "./agent-provider-endpoint-mutation";
import {
  isValidEndpointProviderId,
  validateEndpointProviderConfig,
  type EndpointProviderConfig,
} from "@grida/agent";
import { dirtyState } from "./dirty-state";
import {
  allHostAppIds,
  isHostAppId,
  openWorkspaceInHostApp,
  resolvePreferredHostApps,
  type HostAppId,
} from "./host-apps";
import {
  createTerminal,
  killTerminal,
  resizeTerminal,
  writeTerminal,
} from "./terminal-host";
import {
  subscribeWorkspaceChanges,
  unsubscribeWorkspaceChanges,
} from "./workspace-watcher-host";
import { trashWorkspaceEntry } from "./workspace-files";
import {
  createChatGptOAuthCoordinator,
  type ChatGptOAuthCoordinator,
} from "./chatgpt-oauth";
import { ipc_admission, type DesktopIpcRole } from "./ipc-admission";
import { ipc_sender } from "./ipc-sender";
import { DesktopMediaHost } from "./media-host";
import { DesktopMediaRoot } from "./media-root";
import { NativeChatIpc, type ActiveNativeChat } from "./native-chat-ipc";

// `new URL(EDITOR_BASE_URL).origin` is needed per IPC invoke; parse the
// build-time constant once at module init rather than per call.
const EDITOR_ORIGIN = (() => {
  try {
    return new URL(EDITOR_BASE_URL).origin;
  } catch {
    return "";
  }
})();

const providerEndpointMutations =
  new AgentProviderEndpointMutation.Coordinator();
const legacyChatgptOAuth = createChatGptOAuthCoordinator({
  sidecar_fetch: (path, init) => agentSidecarClient.fetch(path, init),
  open_external: async (url) => {
    await shell.openExternal(url);
  },
});

type RegisterIpcHandlersOptions = {
  resolve_ipc_role: (window: BrowserWindow) => DesktopIpcRole | null;
  recent_files?: Pick<RecentStore, "list" | "touch" | "pin" | "forget">;
  resolve_native_chat?: (
    window: BrowserWindow,
    workspaceId: string
  ) => ActiveNativeChat | null;
  /** Present when this main process has selected native chat mode. */
  ensure_native_chat?: (workspaceId: string) => Promise<void>;
  publish_workspace_surfaces?: (
    event: IpcMainInvokeEvent,
    snapshot: unknown
  ) => Promise<boolean>;
  native_chatgpt_oauth?: Pick<
    ChatGptOAuthCoordinator,
    "connect" | "cancel" | "status" | "signOut"
  >;
  on_onboarding_complete?: (input: {
    window: BrowserWindow;
    workspace_id?: string;
  }) => Promise<void> | void;
  on_account_sign_out?: (input: {
    window: BrowserWindow;
  }) => Promise<void> | void;
};

export function registerIpcHandlers(options: RegisterIpcHandlersOptions) {
  const mediaHost = new DesktopMediaHost({
    root: DesktopMediaRoot.current(),
    reveal: (nativePath) => shell.showItemInFolder(nativePath),
    openFolder: async (nativePath) => {
      const error = await shell.openPath(nativePath);
      if (error) throw new Error("native folder open failed");
    },
  });
  const recentFiles = options.recent_files ?? agentSidecarClient.recent;
  const admittedWindow = (sender: WebContents) => {
    const window = BrowserWindow.fromWebContents(sender);
    return window && options.resolve_ipc_role(window) === "main"
      ? window
      : null;
  };
  const nativeChat = new NativeChatIpc(
    EDITOR_ORIGIN,
    (sender, workspaceId) => {
      const window = admittedWindow(sender);
      return window
        ? (options.resolve_native_chat?.(window, workspaceId) ?? null)
        : null;
    },
    options.ensure_native_chat && {
      admits: (sender) => admittedWindow(sender) !== null,
      ensure: options.ensure_native_chat,
    },
    async (sender, review) => {
      const window = admittedWindow(sender);
      if (!window) return false;
      const limit = review.kind === "limit";
      const detail = limit
        ? "This workspace default applies to future accepted messages."
        : `This Act message can set or reset the workspace context input limit.\n\n${review.text}`;
      const message =
        review.kind === "limit"
          ? review.limit === null
            ? "Return the context input limit to Automatic?"
            : `Set the context input limit to ${review.limit} tokens?`
          : "Allow this message to change the context input limit?";
      const confirmed = await dialog.showMessageBox(window, {
        type: "question",
        message,
        detail,
        buttons: ["Cancel", limit ? "Save setting" : "Send with permission"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return confirmed.response === 1;
    },
    async (sender, title, ownedChildren) => {
      const window = admittedWindow(sender);
      if (!window) return false;
      const chat = title ? `“${title}”` : "This chat";
      const children = ownedChildren
        ? ` This also deletes ${ownedChildren} named ${ownedChildren === 1 ? "subagent" : "subagents"} and their private data.`
        : "";
      const result = await dialog.showMessageBox(window, {
        type: "warning",
        message: "Delete this saved chat?",
        detail: `${chat} and its private attachments and working copies will be permanently removed.${children} Project files and independent forks stay available.`,
        buttons: ["Cancel", "Delete chat"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return result.response === 1;
    },
    async (sender) => {
      const window = admittedWindow(sender);
      if (!window) throw new Error("native_chat_artifact_unavailable");
      const result = await dialog.showSaveDialog(window, {
        title: "Save cropped PNG",
        defaultPath: "cropped.png",
        filters: [{ name: "PNG image", extensions: ["png"] }],
      });
      return result.canceled || !result.filePath ? null : result.filePath;
    }
  );
  /**
   * GRIDA-SEC-004 / GRIDA-SEC-005 — every native IPC invoke must pass both
   * structural URL admission and the controller-owned window/role capability
   * policy. Path scope alone is insufficient: sign-in and onboarding are
   * `/desktop/*` documents too, and a hidden Settings renderer remains alive
   * just long enough to receive the successful sign-out reply.
   */
  function guarded<A extends unknown[], R>(
    channel: IpcChannel,
    handler: (event: IpcMainInvokeEvent, ...args: A) => R
  ): void {
    ipcMain.handle(channel, (event, ...args) => {
      const senderUrl = event.senderFrame?.url;
      const window = BrowserWindow.fromWebContents(event.sender);
      const role = window ? options.resolve_ipc_role(window) : null;
      const pathname = ipc_sender.pathname(senderUrl);
      if (
        !ipc_sender.isAllowed(senderUrl, EDITOR_ORIGIN) ||
        !role ||
        !pathname ||
        !ipc_admission.allows({ role, channel, pathname })
      ) {
        console.warn(
          `[grida] IPC ${channel} denied: sender=${ipc_sender.diagnostic(senderUrl)}`
        );
        throw new Error(`IPC ${channel} denied`);
      }
      return handler(event, ...(args as A));
    });
  }

  guarded(IPC_CHANNELS.AGENT_SERVER_INFO, () => {
    const info = getAgentSidecarInfo();
    if (!info) throw new Error("agent sidecar not ready");
    return info;
  });

  guarded(IPC_CHANNELS.NATIVE_CHAT_AVAILABLE, (event) =>
    nativeChat.available(event)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_STATUS, (event, start?: boolean) =>
    nativeChat.status(event, start)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_LIST, (event, cursor?: string | null) =>
    nativeChat.list(event, cursor)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_LIST_ARCHIVED,
    (event, cursor?: string | null) => nativeChat.list(event, cursor, true)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_CATALOG_ENTRY, (event, id: string) =>
    nativeChat.catalogEntry(event, id)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_ORGANIZE,
    (event, id: string, change: unknown) =>
      nativeChat.organize(event, id, change)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_DELETE,
    (event, id: string, observationId: unknown, catalogRevision: unknown) =>
      nativeChat.deleteSavedChat(event, id, observationId, catalogRevision)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_COMMANDS, (event, id: string) =>
    nativeChat.commands(event, id)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_RUN_COMMAND,
    (event, id: string, command: unknown, requestId: unknown) =>
      nativeChat.runCommand(event, id, command, requestId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_PREPARE_REVISION,
    (event, id: string, observationId: unknown, messageId: unknown) =>
      nativeChat.prepareRevision(event, id, observationId, messageId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_REVISE,
    (event, id: string, input: unknown) => nativeChat.revise(event, id, input)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_CREATE, (event) => nativeChat.create(event));
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_LIST_SUBAGENTS,
    (event, id: string, afterChildId: unknown) =>
      nativeChat.listSubagents(event, id, afterChildId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_INSPECT_SUBAGENT,
    (event, id: string, childId: unknown, inputId: unknown) =>
      nativeChat.inspectSubagent(event, id, childId, inputId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CREATE_SUBAGENT,
    (event, id: string, input: unknown) =>
      nativeChat.createSubagent(event, id, input)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_ASSIGN_SUBAGENT,
    (event, id: string, input: unknown) =>
      nativeChat.assignSubagent(event, id, input)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_STOP_SUBAGENT,
    (event, id: string, stopObservationId: unknown, requestId: unknown) =>
      nativeChat.stopSubagent(event, id, stopObservationId, requestId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CONTROL_SUBAGENT_TURN,
    (
      event,
      id: string,
      observationId: unknown,
      requestId: unknown,
      control: unknown
    ) =>
      nativeChat.controlSubagentTurn(
        event,
        id,
        observationId,
        requestId,
        control
      )
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_LOAD, (event, id: string) =>
    nativeChat.load(event, id)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CONTROL_SUBAGENT_CHILD,
    (
      event,
      id: string,
      observationId: unknown,
      requestId: unknown,
      control: unknown
    ) =>
      nativeChat.controlSubagentChild(
        event,
        id,
        observationId,
        requestId,
        control
      )
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_OPEN_SIDE,
    (event, id: string, openId: string) =>
      nativeChat.openSideChat(event, id, openId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_ASK_SIDE,
    (event, id: string, openId: string, requestId: string, text: string) =>
      nativeChat.askSideChat(event, id, openId, requestId, text)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CLOSE_SIDE,
    (event, id: string, openId: string) =>
      nativeChat.closeSideChat(event, id, openId)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_DETACH, (event, id: string) =>
    nativeChat.detach(event, id)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_PUBLISH_EDITOR_SURFACES,
    (event, attachmentId: string, snapshot: unknown, revision?: unknown) =>
      nativeChat.publishEditorSurfaces(event, attachmentId, snapshot, revision)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SUBMIT,
    (
      event,
      id: string,
      input: string,
      text: string,
      regime?: unknown,
      effort?: unknown,
      svgTargetId?: unknown
    ) => nativeChat.submit(event, id, input, text, regime, effort, svgTargetId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_EDITOR_SVG_TEXT_RESULT,
    (event, attachmentId: string, callId: unknown, result: unknown) =>
      nativeChat.replyEditorSvgText(event, attachmentId, callId, result)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_ENQUEUE,
    (
      event,
      id: string,
      input: string,
      text: string,
      regime?: unknown,
      effort?: unknown
    ) => nativeChat.enqueue(event, id, input, text, regime, effort)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_EFFORT, (event) =>
    nativeChat.acceptsEffort(event)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_PNG, (event) =>
    nativeChat.acceptsPng(event)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_ACCEPTS_WAKEUPS, (event) =>
    nativeChat.acceptsWakeups(event)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SUBMIT_WAKEUP,
    (event, id: string, input: string, text: string, effort?: unknown) =>
      nativeChat.submitWithWakeup(event, id, input, text, effort)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SCHEDULED_WAKEUP,
    (event, id: string, observation: string) =>
      nativeChat.scheduledWakeup(event, id, observation)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CONTROL_WAKEUP,
    (event, id: string, observation: string, wait: unknown, action: unknown) =>
      nativeChat.controlWakeup(event, id, observation, wait, action)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_CONTEXT_LIMIT, (event) =>
    nativeChat.contextLimit(event)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SAVE_CONTEXT_LIMIT,
    (event, reviewId: unknown, value: unknown) =>
      nativeChat.saveContextLimit(event, reviewId, value)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SUBMIT_CONFIGURATION,
    (event, id: string, input: unknown) =>
      nativeChat.submitWithConfigurationReview(event, id, input)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SUBMIT_IMAGE,
    (event, id: string, input: unknown) =>
      nativeChat.submitImage(event, id, input)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_INPUT_RECEIPT,
    (event, id: string, input: string) =>
      nativeChat.inputReceipt(event, id, input)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_OBSERVE, (event, id: string) =>
    nativeChat.observe(event, id)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_TURN_SUMMARY,
    (event, id: string, observation: string) =>
      nativeChat.turnSummary(event, id, observation)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_READ_ARTIFACT,
    (event, id: string, observation: string, artifact: unknown) =>
      nativeChat.readArtifact(event, id, observation, artifact)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SAVE_ARTIFACT,
    (event, id: string, observation: string, artifact: unknown) =>
      nativeChat.saveArtifact(event, id, observation, artifact)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_QUEUE,
    (event, id: string, observation: string, offset: number) =>
      nativeChat.queue(event, id, observation, offset)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_QUEUED_TEXT,
    (event, id: string, observation: string, inputId: string) =>
      nativeChat.queuedText(event, id, observation, inputId)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_EDIT_QUEUE,
    (event, id: string, change: unknown) =>
      nativeChat.editQueue(event, id, change)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_STEER, (event, id: string, input: unknown) =>
    nativeChat.steer(event, id, input)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_GOAL,
    (event, id: string, observation: string) =>
      nativeChat.goal(event, id, observation)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_START_GOAL,
    (event, id: string, inputId: string, request: unknown) =>
      nativeChat.startGoal(event, id, inputId, request)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CONTROL_GOAL,
    (event, id: string, change: unknown) =>
      nativeChat.controlGoal(event, id, change)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_APPROVALS,
    (event, id: string, observation: string) =>
      nativeChat.approvals(event, id, observation)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_ANSWER_APPROVAL,
    (event, id: string, review: string, decision: unknown) =>
      nativeChat.answerApproval(event, id, review, decision)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_QUESTIONS,
    (event, id: string, observation: string) =>
      nativeChat.questions(event, id, observation)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_ANSWER_QUESTION,
    (event, id: string, review: string, answer: unknown) =>
      nativeChat.answerQuestion(event, id, review, answer)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_TRANSCRIPT, (event, id: string) =>
    nativeChat.transcript(event, id)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_CONTROL,
    (event, id: string, control: unknown) =>
      nativeChat.control(event, id, control)
  );
  guarded(
    IPC_CHANNELS.NATIVE_CHAT_SUBSCRIBE,
    (event, id: string, subscription: string) =>
      nativeChat.subscribe(event, id, subscription)
  );
  guarded(IPC_CHANNELS.NATIVE_CHAT_UNSUBSCRIBE, (event, subscription: string) =>
    nativeChat.unsubscribe(event, subscription)
  );

  // GRIDA-SEC-004 — onboarding never receives AGENT_SERVER_INFO. These
  // handlers keep the daemon bearer and the chosen absolute path on the
  // trusted side of the bridge, returning only the user-facing Workspace DTO.
  guarded(IPC_CHANNELS.ONBOARDING_WORKSPACE_DEFAULT, async () => {
    const workspaces = await agentSidecarClient.listWorkspaces();
    return workspaces.find((workspace) => workspace.is_default) ?? null;
  });
  async function chooseWorkspace(event: IpcMainInvokeEvent) {
    const window = BrowserWindow.fromWebContents(event.sender);
    const { sender, senderFrame: frame } = event;
    const role = window && options.resolve_ipc_role(window);
    if (!window || !role || !frame || frame !== sender.mainFrame)
      throw new Error("workspace_picker_unavailable");
    let current = true;
    const revoke = ipc_sender.watchNavigation(sender, () => (current = false));
    try {
      const result = await dialog.showOpenDialog(window, {
        properties: ["openDirectory", "createDirectory"],
      });
      if (
        !current ||
        sender.isDestroyed() ||
        frame !== sender.mainFrame ||
        options.resolve_ipc_role(window) !== role ||
        !ipc_sender.isAllowed(frame.url, EDITOR_ORIGIN) ||
        result.canceled ||
        result.filePaths.length !== 1
      )
        return null;
      return await agentSidecarClient.openWorkspace(result.filePaths[0]);
    } finally {
      revoke();
    }
  }
  guarded(IPC_CHANNELS.ONBOARDING_WORKSPACE_CHOOSE, chooseWorkspace);
  guarded(IPC_CHANNELS.WORKSPACE_LIST, () =>
    agentSidecarClient.listWorkspaces()
  );
  guarded(
    IPC_CHANNELS.WORKSPACE_PUBLISH_EDITOR_SURFACES,
    (event, snapshot: unknown) =>
      options.publish_workspace_surfaces?.(event, snapshot) ?? false
  );
  guarded(IPC_CHANNELS.WORKSPACE_CHOOSE, chooseWorkspace);
  guarded(IPC_CHANNELS.WORKSPACE_REOPEN, (_event, root: unknown) => {
    if (typeof root !== "string" || !root || Buffer.byteLength(root) > 4096)
      throw new Error("workspace_root_invalid");
    return agentSidecarClient.reopenWorkspace(root);
  });
  guarded(IPC_CHANNELS.WORKSPACE_CREATE, (_event, name: unknown) => {
    if (
      name !== undefined &&
      (typeof name !== "string" || Buffer.byteLength(name) > 4096)
    )
      throw new Error("workspace_name_invalid");
    return agentSidecarClient.createWorkspace(name);
  });
  guarded(
    IPC_CHANNELS.WORKSPACE_PIN,
    (_event, id: unknown, pinned: unknown) => {
      if (!workspaceIdValue(id) || typeof pinned !== "boolean")
        throw new Error("workspace_pin_invalid");
      return agentSidecarClient.pinWorkspace(id, pinned);
    }
  );
  guarded(IPC_CHANNELS.WORKSPACE_FORGET, (_event, id: unknown) => {
    if (!workspaceIdValue(id)) throw new Error("workspace_id_invalid");
    return agentSidecarClient.forgetWorkspace(id);
  });
  guarded(
    IPC_CHANNELS.WORKSPACE_READ,
    async (event, id: unknown, relative: unknown, kind: unknown) => {
      if (
        !workspaceIdValue(id) ||
        typeof relative !== "string" ||
        Buffer.byteLength(relative) > 4096 ||
        (kind !== "text" && kind !== "bytes" && kind !== "directory")
      )
        throw new Error("workspace_read_invalid");
      return await workspaceRequest(
        event,
        "workspace_read_unavailable",
        async (signal) =>
          kind === "directory"
            ? await agentSidecarClient.readWorkspaceDirectory(
                id,
                relative,
                signal
              )
            : await agentSidecarClient.readWorkspaceFile(
                id,
                relative,
                kind,
                signal
              )
      );
    }
  );
  guarded(
    IPC_CHANNELS.WORKSPACE_WRITE,
    async (
      event,
      id: unknown,
      relative: unknown,
      content: unknown,
      expectedMtime: unknown
    ) => {
      if (
        !workspaceIdValue(id) ||
        typeof relative !== "string" ||
        Buffer.byteLength(relative) > 4096 ||
        typeof content !== "string" ||
        (expectedMtime !== undefined &&
          (typeof expectedMtime !== "number" ||
            !Number.isFinite(expectedMtime)))
      )
        throw new Error("workspace_write_invalid");
      return await workspaceRequest(
        event,
        "workspace_write_unavailable",
        (signal, check) =>
          agentSidecarClient.writeWorkspaceFile(
            id,
            relative,
            content,
            expectedMtime,
            signal,
            check
          )
      );
    }
  );

  async function workspaceRequest<T>(
    event: IpcMainInvokeEvent,
    unavailable: string,
    run: (signal: AbortSignal, check: () => void) => Promise<T>
  ): Promise<T> {
    const { sender, senderFrame: frame } = event;
    const window = BrowserWindow.fromWebContents(sender);
    const controller = new AbortController();
    const check = () => {
      if (
        controller.signal.aborted ||
        !window ||
        !frame ||
        sender.isDestroyed() ||
        frame !== sender.mainFrame ||
        options.resolve_ipc_role(window) !== "main" ||
        !ipc_sender.isAllowed(frame.url, EDITOR_ORIGIN)
      )
        throw new Error(unavailable);
    };
    check();
    const unwatch = ipc_sender.watchNavigation(sender, () =>
      controller.abort()
    );
    try {
      const result = await run(controller.signal, check);
      check();
      return result;
    } finally {
      unwatch();
    }
  }

  const chatgptOAuth = options.native_chatgpt_oauth ?? legacyChatgptOAuth;
  guarded(IPC_CHANNELS.CHATGPT_CONNECT, () => chatgptOAuth.connect());
  guarded(IPC_CHANNELS.CHATGPT_CANCEL, async () => {
    await chatgptOAuth.cancel();
  });
  guarded(IPC_CHANNELS.CHATGPT_STATUS, () => chatgptOAuth.status());
  guarded(IPC_CHANNELS.CHATGPT_SIGN_OUT, () => chatgptOAuth.signOut());

  // issue #974 — custom endpoints are network authority, not just config.
  // Renderer writes/probes therefore cross a guarded native confirmation
  // before main mints an exact-origin grant for the sidecar transport.
  guarded(
    IPC_CHANNELS.PROVIDER_ENDPOINT_SET,
    async (event, input: EndpointProviderConfig) => {
      const validated = validateEndpointProviderConfig(input);
      if (!validated.ok) throw new Error(validated.error);
      const config = validated.config;
      await providerEndpointMutations.run(config.id, async () => {
        const endpoint = await describeAgentProviderEndpoint(config.base_url);
        await confirmProviderOrigin(event, endpoint.origin, endpoint.route);
        // Persist first: config writes perform no provider egress. Only after
        // the authenticated sidecar accepts the config does main publish its
        // grant. The per-id coordinator keeps this SET atomic with DELETE and
        // replacement SET ceremonies for the same endpoint.
        await agentSidecarClient.setProviderEndpoint(config);
        await approveAgentProviderEndpoint(config.id, config.base_url);
      });
    }
  );

  guarded(IPC_CHANNELS.PROVIDER_ENDPOINT_DELETE, async (_event, id: string) => {
    if (!isValidEndpointProviderId(id)) {
      throw new Error("provider endpoint id is invalid");
    }
    await providerEndpointMutations.run(id, async () => {
      await AgentProviderEndpointMutation.remove({
        revokeAuthority: async () => await revokeAgentProviderEndpoint(id),
        deleteConfiguration: async () =>
          await agentSidecarClient.deleteProviderEndpoint(id),
      });
    });
  });

  guarded(
    IPC_CHANNELS.PROVIDER_ENDPOINT_PROBE,
    async (event, baseUrl: string) => {
      const endpoint = await describeAgentProviderEndpoint(baseUrl);
      await confirmProviderOrigin(event, endpoint.origin, endpoint.route);
      return await withTemporaryAgentProviderEndpoint(
        baseUrl,
        async () => await agentSidecarClient.probeProviderEndpoint(baseUrl)
      );
    }
  );

  guarded(IPC_CHANNELS.WINDOW_SET_DOCUMENT_EDITED, (event, edited: boolean) => {
    // setDocumentEdited is macOS-only. On other platforms the
    // method exists but is a no-op — calling it is safe everywhere.
    // `dirtyState.set` dedups internally; if the flag is unchanged
    // we skip the native call too so per-keystroke IPC bursts on a
    // dirty doc don't ripple into BrowserWindow.fromWebContents.
    if (!dirtyState.set(event.sender.id, Boolean(edited))) return;
    BrowserWindow.fromWebContents(event.sender)?.setDocumentEdited(
      Boolean(edited)
    );
  });

  guarded(
    IPC_CHANNELS.WINDOW_SET_REPRESENTED_FILENAME,
    (event, filePath: string) => {
      BrowserWindow.fromWebContents(event.sender)?.setRepresentedFilename(
        String(filePath)
      );
    }
  );

  guarded(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  guarded(
    IPC_CHANNELS.WINDOW_COMPLETE_ONBOARDING,
    async (event, workspaceId?: string) => {
      const senderUrl = event.senderFrame?.url;
      if (ipc_sender.pathname(senderUrl) !== "/desktop/onboarding") {
        throw new Error(
          "onboarding completion is only available to onboarding"
        );
      }
      if (
        workspaceId !== undefined &&
        (typeof workspaceId !== "string" ||
          workspaceId.length === 0 ||
          workspaceId.length > 1024)
      ) {
        throw new Error("invalid onboarding workspace id");
      }
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window || !options.on_onboarding_complete) {
        throw new Error("onboarding completion is unavailable");
      }
      await options.on_onboarding_complete({
        window,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      });
    }
  );

  // GRIDA-SEC-005 — one global Grida-account sign-out transition. Only the
  // Settings account surface may request it; the controller additionally
  // validates current app role and resolves dirty auxiliary windows before
  // the shared cookie session changes.
  guarded(IPC_CHANNELS.ACCOUNT_SIGN_OUT, async (event) => {
    const senderUrl = event.senderFrame?.url;
    if (ipc_sender.pathname(senderUrl) !== "/desktop/settings") {
      throw new Error("account sign-out is only available from Settings");
    }
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || !options.on_account_sign_out) {
      throw new Error("account sign-out is unavailable");
    }
    await options.on_account_sign_out({ window });
  });

  guarded(IPC_CHANNELS.DIALOG_CONFIRM, async (event, opts: ConfirmOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      type: "question" as const,
      message: opts.message,
      detail: opts.detail,
      buttons: opts.buttons,
      defaultId: opts.default_id,
      cancelId: opts.cancel_id,
    };
    const result = window
      ? await dialog.showMessageBox(window, options)
      : await dialog.showMessageBox(options);
    return result.response;
  });

  guarded(IPC_CHANNELS.DIALOG_OPEN, async (event, opts: OpenDialogOptions) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options = {
      defaultPath: opts.default_path,
      filters: opts.filters,
      properties: opts.properties,
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return null;
    return result.filePaths;
  });

  guarded(
    IPC_CHANNELS.DIALOG_SAVE_AS,
    async (event, opts: SaveDialogOptions) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: opts.default_path,
        filters: opts.filters,
      };
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    }
  );

  guarded(IPC_CHANNELS.SHELL_OPEN_EXTERNAL, async (_event, url: string) => {
    if (typeof url !== "string" || !isSafeExternalUrl(url)) {
      throw new Error(
        `[grida] refused to open url: ${String(url).slice(0, 64)}`
      );
    }
    await shell.openExternal(url);
  });

  guarded(
    IPC_CHANNELS.SHELL_SHOW_ITEM_IN_FOLDER,
    (_event, filePath: string) => {
      if (typeof filePath !== "string" || filePath.length === 0) {
        throw new Error(
          `[grida] refused to reveal path: ${String(filePath).slice(0, 64)}`
        );
      }
      // `path.resolve` normalises `..` and treats the input as
      // already-absolute when it is; we never join against the
      // main process's cwd implicitly. If the path doesn't exist,
      // the OS silently opens the parent or no-ops.
      shell.showItemInFolder(path.resolve(filePath));
    }
  );

  // GRIDA-SEC-004 — recents stores path metadata. Opening a file has its
  // own trusted native admission.
  function guardedRecent<A extends unknown[], R>(
    channel: IpcChannel,
    operation: (...args: A) => Promise<R>
  ): void {
    guarded(channel, async ({ sender, senderFrame: frame }, ...args: A) => {
      const url = frame?.url;
      let revoked = false;
      const requireCurrent = () => {
        if (
          revoked ||
          !frame ||
          sender.isDestroyed() ||
          frame !== sender.mainFrame ||
          frame.url !== url ||
          !admittedWindow(sender)
        ) {
          throw new Error("recent_files_unavailable");
        }
      };
      requireCurrent();
      const unwatch = ipc_sender.watchNavigation(sender, () => {
        revoked = true;
      });
      try {
        const result = await operation(...args);
        requireCurrent();
        return result;
      } catch {
        throw new Error("recent_files_unavailable");
      } finally {
        unwatch();
      }
    });
  }
  function recentPath(value: unknown): string {
    if (
      typeof value !== "string" ||
      !path.isAbsolute(value) ||
      value.includes("\0") ||
      Buffer.byteLength(value, "utf8") > 4096
    ) {
      throw new Error("recent_file_path_invalid");
    }
    return value;
  }
  guardedRecent(IPC_CHANNELS.RECENT_LIST, () => recentFiles.list());
  guardedRecent(IPC_CHANNELS.RECENT_TOUCH, (filePath: unknown) =>
    recentFiles.touch(recentPath(filePath))
  );
  guardedRecent(
    IPC_CHANNELS.RECENT_PIN,
    (filePath: unknown, pinned: unknown) => {
      if (typeof pinned !== "boolean")
        throw new Error("recent_file_pin_invalid");
      return recentFiles.pin(recentPath(filePath), pinned);
    }
  );
  guardedRecent(IPC_CHANNELS.RECENT_FORGET, (filePath: unknown) =>
    recentFiles.forget(recentPath(filePath))
  );

  // GRIDA-SEC-004 — durable media operations are path-free and admitted only
  // from the exact main-role `/desktop/tools` surface. `DesktopMediaHost`
  // resolves opaque ids and keeps every native path on this side of IPC.
  guarded(IPC_CHANNELS.MEDIA_LIST, () => mediaHost.list());
  guarded(IPC_CHANNELS.MEDIA_READ, (_event, id: string) => mediaHost.read(id));
  guarded(IPC_CHANNELS.MEDIA_SAVE_COPY, (event, id: unknown) => {
    const { sender, senderFrame: frame } = event;
    const window = admittedWindow(sender);
    if (!window || !frame || typeof id !== "string")
      throw new Error("media-save-copy-unavailable");
    let revoked = false;
    const requireCurrent = () => {
      if (
        revoked ||
        sender.isDestroyed() ||
        sender.isLoadingMainFrame() ||
        frame !== sender.mainFrame ||
        admittedWindow(sender) !== window ||
        !ipc_sender.isAllowed(frame.url, EDITOR_ORIGIN) ||
        ipc_sender.pathname(frame.url) !== "/desktop/tools"
      )
        throw new Error("media-save-copy-unavailable");
    };
    requireCurrent();
    const unwatch = ipc_sender.watchNavigation(sender, () => {
      revoked = true;
    });
    return mediaHost
      .saveCopy(
        id,
        async (fileName, extension) => {
          const result = await dialog.showSaveDialog(window, {
            title: "Save a copy",
            defaultPath: fileName,
            filters: [{ name: "Media file", extensions: [extension.slice(1)] }],
          });
          return result.canceled || !result.filePath ? null : result.filePath;
        },
        requireCurrent
      )
      .finally(unwatch);
  });
  guarded(IPC_CHANNELS.MEDIA_REVEAL, async (_event, id: string) => {
    await mediaHost.reveal(id);
  });
  guarded(IPC_CHANNELS.MEDIA_OPEN_FOLDER, async () => {
    await mediaHost.openFolder();
  });

  guarded(IPC_CHANNELS.WINDOW_NAVIGATION_STATE, (event) =>
    computeNavigationState(event.sender)
  );

  guarded(IPC_CHANNELS.WINDOW_NAVIGATION_BACK, (event) => {
    const history = event.sender.navigationHistory;
    // Second check here is robust against a stale UI (e.g. a click in
    // flight when the history just collapsed).
    if (history.canGoBack()) history.goBack();
  });

  guarded(IPC_CHANNELS.WINDOW_NAVIGATION_FORWARD, (event) => {
    const history = event.sender.navigationHistory;
    if (history.canGoForward()) history.goForward();
  });

  guarded(
    IPC_CHANNELS.HOST_APPS_RESOLVE_PREFERRED,
    async (
      _event,
      opts: { workspace_id: string; preferred_apps?: readonly unknown[] }
    ) => {
      await findWorkspaceOrThrow(opts.workspace_id);
      const preferred =
        opts.preferred_apps === undefined
          ? allHostAppIds()
          : parsePreferredApps(opts.preferred_apps);
      // Resolve after workspace validation so stale workspace ids fail
      // instead of returning app availability for an impossible action.
      return await resolvePreferredHostApps(preferred);
    }
  );

  guarded(
    IPC_CHANNELS.HOST_APPS_OPEN_WORKSPACE,
    async (_event, opts: { workspace_id: string; app_id: string }) => {
      if (!isHostAppId(opts.app_id)) {
        throw new Error(`unknown host app: ${opts.app_id}`);
      }
      const workspace = await findWorkspaceOrThrow(opts.workspace_id);
      await openWorkspaceInHostApp(opts.app_id, workspace);
    }
  );

  // GRIDA-SEC-004: move a workspace entry (file or folder) to the OS
  // trash. The workspace is resolved from its id through the sidecar
  // (same as host-apps), and `trashWorkspaceEntry` re-validates that
  // `relPath` lands inside the workspace root (and isn't the root itself)
  // before the native `shell.trashItem`. The renderer never passes a raw
  // absolute path, so a compromised renderer can't trash entries outside
  // an opened workspace.
  guarded(
    IPC_CHANNELS.WORKSPACE_TRASH_ENTRY,
    async (_event, opts: { workspace_id: string; rel_path: string }) => {
      const workspace = await findWorkspaceOrThrow(opts.workspace_id);
      await trashWorkspaceEntry(workspace, opts.rel_path);
    }
  );

  // GRIDA-SEC-004: human-interactive terminal. The PTY spawn cwd is the
  // workspace root resolved from the sidecar registry — the renderer
  // only ever names a workspace id, never a raw path. The PTY host
  // additionally binds each terminal to its creating WebContents (see
  // terminal-host.ts), so these guarded channels are the only way in.
  guarded(
    IPC_CHANNELS.TERMINAL_CREATE,
    async (
      event,
      opts: { id: string; workspace_id: string; cols: number; rows: number }
    ) => {
      const workspace = await findWorkspaceOrThrow(opts.workspace_id);
      await createTerminal(event.sender, {
        id: opts.id,
        cwd: workspace.root,
        cols: opts.cols,
        rows: opts.rows,
      });
    }
  );

  guarded(
    IPC_CHANNELS.TERMINAL_WRITE,
    (event, opts: { id: string; data: string }) => {
      writeTerminal(event.sender, opts.id, opts.data);
    }
  );

  guarded(
    IPC_CHANNELS.TERMINAL_RESIZE,
    (event, opts: { id: string; cols: number; rows: number }) => {
      resizeTerminal(event.sender, opts.id, opts.cols, opts.rows);
    }
  );

  guarded(IPC_CHANNELS.TERMINAL_KILL, (event, id: string) => {
    killTerminal(event.sender, id);
  });

  // issue #805 — workspace file-change watcher. The watch root is the
  // workspace root resolved host-side from the sidecar registry; the
  // renderer only names a workspace id (never a raw path), exactly like
  // TERMINAL_CREATE and WORKSPACE_TRASH_ENTRY. The watcher host binds each
  // subscription to its creating WebContents (push + kill-on-close).
  guarded(
    IPC_CHANNELS.WORKSPACE_SUBSCRIBE_CHANGES,
    async (event, opts: { id: string; workspace_id: string }) => {
      const workspace = await findWorkspaceOrThrow(opts.workspace_id);
      await subscribeWorkspaceChanges(event.sender, {
        id: opts.id,
        root: workspace.root,
        workspaceId: opts.workspace_id,
      });
    }
  );

  guarded(IPC_CHANNELS.WORKSPACE_UNSUBSCRIBE_CHANGES, (_event, id: string) => {
    unsubscribeWorkspaceChanges(id);
  });
}

/** Close any active native-provider callback before Electron exits. */
export function closeChatGptOAuth(): void {
  void legacyChatgptOAuth.close().catch(() => {});
}

async function confirmProviderOrigin(
  event: IpcMainInvokeEvent,
  origin: string,
  route: string
): Promise<void> {
  const window = BrowserWindow.fromWebContents(event.sender);
  const options = {
    type: "warning" as const,
    message: "Allow this AI provider endpoint?",
    detail:
      `${origin}\n${route}\n\nGrida will let the agent sidecar contact only this origin ` +
      "for provider requests until the app closes.",
    buttons: ["Allow", "Cancel"],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  if (result.response !== 0)
    throw new Error("provider endpoint was not approved");
}

async function findWorkspaceOrThrow(workspaceId: string) {
  const workspace = await agentSidecarClient.findWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  return workspace;
}

function workspaceIdValue(id: unknown): id is string {
  return typeof id === "string" && /^[a-f0-9]{16}$/.test(id);
}

function parsePreferredApps(raw: readonly unknown[]): HostAppId[] {
  const ids: HostAppId[] = [];
  for (const item of raw) {
    if (typeof item === "string" && isHostAppId(item)) ids.push(item);
  }
  return ids;
}

/**
 * Compute the current `{canGoBack, canGoForward}` for a webContents.
 * Exported so `attachNavigationEvents` (called from `window.ts` at
 * window-creation time) can publish initial state immediately rather
 * than waiting for the first `did-navigate*` to fire.
 */
export function computeNavigationState(wc: WebContents): NavigationState {
  const history = wc.navigationHistory;
  return {
    can_go_back: history.canGoBack(),
    can_go_forward: history.canGoForward(),
  };
}

/**
 * Wire a window's webContents navigation events to the renderer.
 * Called once per `BrowserWindow` at creation time (see
 * `desktop/src/window.ts::create_main_window`).
 *
 * `did-navigate` fires on full-page loads; `did-navigate-in-page`
 * fires on SPA pushState/replaceState from Next.js client routing.
 * Both invalidate the back/forward state, so both push a fresh
 * snapshot to the renderer via `WINDOW_NAVIGATION_CHANGED`. The
 * renderer's preload fans out to React subscribers from there.
 *
 * The send is guarded by `isDestroyed()` because the event handlers
 * stay attached until the webContents is torn down, and Electron can
 * deliver a final event after the renderer process has gone away
 * (Chromium's teardown ordering is not deterministic).
 */
export function attachNavigationEvents(window: BrowserWindow): void {
  const wc = window.webContents;
  let last: NavigationState | null = null;
  const publish = () => {
    if (wc.isDestroyed()) return;
    const next = computeNavigationState(wc);
    // SPA pushState/replaceState from Next.js client routing fires
    // `did-navigate-in-page` even when back/forward state didn't move
    // — skip the IPC + downstream React re-renders in that case.
    if (
      last &&
      last.can_go_back === next.can_go_back &&
      last.can_go_forward === next.can_go_forward
    ) {
      return;
    }
    last = next;
    wc.send(IPC_CHANNELS.WINDOW_NAVIGATION_CHANGED, next);
  };
  wc.on("did-navigate", publish);
  wc.on("did-navigate-in-page", publish);
}
