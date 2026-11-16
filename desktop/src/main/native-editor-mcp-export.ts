// GRIDA-SEC-004 — Main owns one explicitly exported, read-only workbench view.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from "electron";
import {
  NativeEditorSurfaces,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { ipc_sender } from "./ipc-sender";
import { NativeAgentProcess } from "./native-agent-process";
import {
  NativeMcpFiles,
  invalidMcpProfile,
  validLocalMcpEndpoint,
} from "./native-mcp-files";

const PREFIX = "--native-chat-export-mcp-";
const BEARER_ENV = "GRIDA_DESKTOP_EDITOR_MCP_BEARER";
const REQUEST_LIMIT = 256;
const REQUEST_ID = /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const UNAVAILABLE: NativeEditorSurfaceSnapshot & { available: boolean } = {
  available: false,
  active: null,
  open: [],
  truncated: false,
};

type Frame = Readonly<{
  sender: WebContents;
  frame: WebFrameMain;
  href: string;
  workspaceId: string;
}>;
type Publication = Frame & {
  snapshot: NativeEditorSurfaceSnapshot;
  unwatch(): void;
};
type Admission = Readonly<{
  editorOrigin: string;
  admits(sender: WebContents): boolean;
  workspaceRoot(id: string): Promise<string>;
}>;

export class NativeEditorMcpExport {
  private publication: Publication | undefined;
  private readonly attaching = new WeakSet<WebContents>();
  private revoked = false;
  private buffer = Buffer.alloc(0);
  private responding = false;
  private readonly exited: Promise<void>;
  private readonly ready = Promise.withResolvers<void>();
  private closing: Promise<void> | undefined;

  private constructor(
    private readonly child: ChildProcessWithoutNullStreams,
    address: string,
    private readonly files: NativeMcpFiles,
    private readonly admission: Admission
  ) {
    this.exited = new Promise((resolve) => {
      child.once("close", () => {
        this.revoke();
        this.ready.reject(unavailable());
        resolve();
      });
    });
    child.once("error", () => this.ready.reject(unavailable()));
    child.stdin.on("error", () => this.endPipe());
    let diagnostic = "";
    child.stderr.on("data", (chunk: Buffer) => {
      if (diagnostic === "\n") return;
      if (diagnostic.length + chunk.length > 512) {
        this.ready.reject(unavailable());
        return;
      }
      diagnostic += chunk.toString("utf8");
      if (!diagnostic.includes("\n")) return;
      const first = diagnostic.slice(0, diagnostic.indexOf("\n"));
      diagnostic = "\n";
      if (first === `grida-agent: MCP listening on ${address}`)
        this.ready.resolve();
      else this.ready.reject(unavailable());
    });
    child.stdout.on("data", (chunk: Buffer) => this.request(chunk));
  }

  static async start(
    argv: readonly string[],
    browserProfile: string,
    resourcesPath: string,
    admission: Admission
  ): Promise<NativeEditorMcpExport | undefined> {
    const separator = argv.indexOf("--");
    const options = (separator < 0 ? argv : argv.slice(0, separator)).filter(
      (arg) => arg.startsWith(PREFIX)
    );
    if (!options.length) return undefined;
    const root = options
      .find((arg) => arg.startsWith(`${PREFIX}root=`))
      ?.slice(PREFIX.length + 5);
    const address = options
      .find((arg) => arg.startsWith(`${PREFIX}listen=`))
      ?.slice(PREFIX.length + 7);
    if (
      options.length !== 2 ||
      !root ||
      !address ||
      !validLocalMcpEndpoint(address) ||
      new URL(address).pathname !== "/mcp"
    )
      throw invalidMcpProfile();
    const files = await NativeMcpFiles.capture(
      root,
      browserProfile,
      "native-mcp-export.bearer"
    );
    const bearer = await files.launchBearer();
    if (bearer.length !== 64 || /[^a-fA-F0-9]/.test(bearer))
      throw invalidMcpProfile();
    const executable = NativeAgentProcess.executable(resourcesPath);
    const child = spawn(
      executable,
      [
        "serve-editor-mcp",
        "--listen",
        address,
        "--server-token-env",
        BEARER_ENV,
      ],
      {
        env: { [BEARER_ENV]: bearer },
        shell: false,
        windowsHide: true,
        stdio: "pipe",
      }
    );
    const owner = new NativeEditorMcpExport(child, address, files, admission);
    try {
      if (!(await settled(owner.ready.promise, 5000))) throw unavailable();
      return owner;
    } catch (error) {
      await owner.close();
      throw error;
    }
  }

  async publish(event: IpcMainInvokeEvent, value: unknown): Promise<boolean> {
    const snapshot = NativeEditorSurfaces.parse(value);
    const frame = this.basis(event);
    if (!snapshot || !frame || this.revoked) return false;
    if (this.publication) {
      if (
        this.publication.sender !== frame.sender ||
        this.publication.frame !== frame.frame ||
        this.publication.href !== frame.href ||
        !this.isCurrent(this.publication)
      )
        return false;
      this.publication.snapshot = snapshot;
      return true;
    }
    if (this.attaching.has(frame.sender)) return false;
    this.attaching.add(frame.sender);
    let navigated = false;
    const candidate: Publication = {
      ...frame,
      snapshot,
      unwatch: ipc_sender.watchNavigation(frame.sender, () => {
        navigated = true;
        if (this.publication === candidate) this.revoke();
      }),
    };
    try {
      if (
        !(await this.matches(frame)) ||
        navigated ||
        this.revoked ||
        this.publication
      )
        return false;
      this.publication = candidate;
      return true;
    } finally {
      this.attaching.delete(frame.sender);
      if (this.publication !== candidate) candidate.unwatch();
    }
  }

  revoke(): void {
    this.revoked = true;
    this.publication?.unwatch();
    this.publication = undefined;
  }

  close(): Promise<void> {
    return (this.closing ??= this.stop());
  }

  private async stop(): Promise<void> {
    this.endPipe();
    if (await settled(this.exited, 3000)) return;
    this.child.kill("SIGKILL");
    if (!(await settled(this.exited, 1000))) throw unavailable();
  }

  private endPipe(): void {
    this.revoke();
    if (!this.child.stdin.writableEnded) this.child.stdin.end();
  }

  private basis({
    sender,
    senderFrame: frame,
  }: IpcMainInvokeEvent): Frame | undefined {
    if (!frame) return;
    const href = frame.url;
    if (!ipc_sender.isAllowed(href, this.admission.editorOrigin)) return;
    const url = new URL(href);
    const [workspaceId, duplicate] = url.searchParams.getAll("id");
    if (
      url.pathname !== "/desktop/workspace" ||
      !workspaceId ||
      workspaceId.length > 128 ||
      duplicate !== undefined
    )
      return;
    const basis = { sender, frame, href, workspaceId };
    return this.isCurrent(basis) ? basis : undefined;
  }

  private isCurrent({ sender, frame, href }: Frame): boolean {
    return (
      !sender.isDestroyed() &&
      !sender.isLoadingMainFrame() &&
      sender.mainFrame === frame &&
      frame.url === href &&
      this.admission.admits(sender)
    );
  }

  private async matches(frame: Frame): Promise<boolean> {
    const root = await this.admission
      .workspaceRoot(frame.workspaceId)
      .catch(() => null);
    return (
      root !== null && (await this.files.matches(root)) && this.isCurrent(frame)
    );
  }

  private request(chunk: Buffer): void {
    if (this.responding || this.buffer.length + chunk.length > REQUEST_LIMIT) {
      this.endPipe();
      return;
    }
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const newline = this.buffer.indexOf(0x0a);
    if (newline < 0) return;
    let requestId: unknown;
    try {
      if (newline + 1 === this.buffer.length) {
        const value = JSON.parse(this.buffer.toString("utf8", 0, newline));
        if (value && Object.keys(value).length === 1)
          requestId = value.requestId;
      }
    } catch {
      /* Invalid private framing retires the pipe. */
    }
    this.buffer = Buffer.alloc(0);
    if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) {
      this.endPipe();
      return;
    }
    this.responding = true;
    void this.reply(requestId)
      .catch(() => this.endPipe())
      .finally(() => {
        this.responding = false;
      });
  }

  private async reply(requestId: string): Promise<void> {
    const owner = this.publication;
    let snapshot = UNAVAILABLE;
    if (owner) {
      if (
        (await this.matches(owner)) &&
        this.publication === owner &&
        !this.revoked
      )
        snapshot = { available: true, ...owner.snapshot };
      else this.revoke();
    }
    if (!this.child.stdin.writableEnded)
      this.child.stdin.write(`${JSON.stringify({ requestId, snapshot })}\n`);
  }
}

async function settled(
  promise: Promise<void>,
  timeout: number
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeout);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(): Error {
  return new Error("native_desktop_editor_mcp_unavailable");
}
