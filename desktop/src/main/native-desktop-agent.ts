// GRIDA-SEC-004 / GRIDA-SEC-006 — Desktop composition of the native workspace owner.
import { AGENT_DEFAULT_TIER } from "@grida/agent/tiers";
import { TIER_MODEL_IDS } from "@grida/ai/catalogue";
import type { DesktopAccountSession } from "./account-session";
import { agentSidecarClient } from "./agent-sidecar-client";
import { nativeAgentGatewayConnection } from "./agent-sidecar-supervisor";
import { NativeAgentCutover } from "./native-agent-cutover";
import { NativeWorkspaceAgents } from "./native-workspace-agents";

export class NativeDesktopAgent {
  private owners: NativeWorkspaceAgents | undefined;
  private accountDrain: Promise<void> | undefined;
  private accountGeneration = 0;
  private closed = false;

  private constructor(
    private readonly cutover: NativeAgentCutover,
    private readonly account: DesktopAccountSession,
    private readonly resourcesPath: string
  ) {}

  static async prepareFresh(
    account: DesktopAccountSession,
    resourcesPath: string
  ) {
    return new NativeDesktopAgent(
      await NativeAgentCutover.prepareFresh(),
      account,
      resourcesPath
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
    const workspace = (await agentSidecarClient.listWorkspaces()).find(
      ({ id }) => id === workspaceId
    );
    if (!workspace) throw new Error("native_workspace_not_registered");
    await owners.open(workspace);
  }

  clearAccount(): Promise<void> {
    this.accountGeneration += 1;
    const owners = this.owners;
    this.owners = undefined;
    if (owners) this.accountDrain = owners.close();
    return this.accountDrain ?? Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return this.clearAccount();
  }

  private newOwners(): NativeWorkspaceAgents {
    return new NativeWorkspaceAgents(
      this.cutover,
      async ({ id, root }, signal) => {
        const gateway = await nativeAgentGatewayConnection(
          this.account,
          undefined,
          signal
        );
        return {
          launch: {
            ...gateway.launch(TIER_MODEL_IDS[AGENT_DEFAULT_TIER]),
            resourcesPath: this.resourcesPath,
            workspace: {
              id,
              primary: { id: "project", name: "Project", path: root },
              additionalReadRoots: [],
              protectedPaths: this.cutover.protectedPaths,
            },
          },
          release: () => gateway.close(),
        };
      }
    );
  }
}
