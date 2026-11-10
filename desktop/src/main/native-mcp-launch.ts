// GRIDA-SEC-004 — one trusted local MCP peer for an exact Desktop workspace.
import type { NativeDesktopProfile } from "./native-desktop-profile";
import {
  NativeMcpFiles,
  invalidMcpProfile,
  validLocalMcpEndpoint,
} from "./native-mcp-files";

const PREFIX = "--native-chat-mcp-";
const BEARER_ENV = "GRIDA_DESKTOP_MCP_BEARER";
const MAX_TOOLS = 16;

export class NativeMcpLaunch {
  #gatewayScope: string | undefined;

  private constructor(
    private readonly files: NativeMcpFiles,
    private readonly endpoint: string,
    private readonly source: string,
    private readonly tools: readonly string[]
  ) {}

  static async configure(
    argv: readonly string[],
    browserProfile: string,
    provider: NativeDesktopProfile.Provider
  ): Promise<NativeMcpLaunch | undefined> {
    const separator = argv.indexOf("--");
    const options = (separator < 0 ? argv : argv.slice(0, separator)).filter(
      (arg) => arg.startsWith(PREFIX)
    );
    if (!options.length) return undefined;
    if (provider !== "gateway" || options.length > MAX_TOOLS + 3)
      throw invalidMcpProfile();

    const singles = new Map<string, string>();
    const tools: string[] = [];
    for (const option of options) {
      const separator = option.indexOf("=");
      const key = option.slice(PREFIX.length, separator);
      const value = option.slice(separator + 1);
      if (separator < 0 || !value) throw invalidMcpProfile();
      if (key === "tool") {
        tools.push(value);
      } else {
        if (!["root", "endpoint", "source"].includes(key) || singles.has(key))
          throw invalidMcpProfile();
        singles.set(key, value);
      }
    }
    const root = singles.get("root");
    const endpoint = singles.get("endpoint");
    const source = singles.get("source");
    if (
      !root ||
      !endpoint ||
      !validLocalMcpEndpoint(endpoint) ||
      !source ||
      source.length > 16 ||
      /[^a-z0-9]/.test(source) ||
      !tools.length ||
      tools.length > MAX_TOOLS ||
      new Set(tools).size !== tools.length ||
      tools.some(
        (tool) =>
          /[^A-Za-z0-9_-]/.test(tool) || source.length + tool.length + 5 > 64
      )
    )
      throw invalidMcpProfile();

    const files = await NativeMcpFiles.capture(
      root,
      browserProfile,
      "native-mcp.bearer"
    );
    return new NativeMcpLaunch(files, endpoint, source, Object.freeze(tools));
  }

  forWorkspace(root: string): NativeMcpLaunch | undefined {
    return this.files.selects(root) ? this : undefined;
  }

  async extendChild(
    root: string,
    gatewayScope: string,
    args: string[],
    environment: NodeJS.ProcessEnv
  ): Promise<void> {
    if (
      !this.files.selects(root) ||
      gatewayScope.length !== 64 ||
      /[^a-f0-9]/.test(gatewayScope)
    )
      throw invalidMcpProfile();
    const bearer = await this.files.launchBearer();
    // Check and bind without yielding so overlapping launches cannot acquire
    // this peer for different account, organization, or origin scopes.
    if (this.#gatewayScope !== undefined && this.#gatewayScope !== gatewayScope)
      throw new Error("native_desktop_mcp_gateway_scope_changed");
    this.#gatewayScope = gatewayScope;
    args.push(
      "--mcp-endpoint",
      this.endpoint,
      "--mcp-token-env",
      BEARER_ENV,
      "--mcp-source",
      this.source
    );
    for (const tool of this.tools) args.push("--mcp-tool", tool);
    environment[BEARER_ENV] = bearer;
  }
}
