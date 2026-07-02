import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorkspaceRegistry, type Workspace } from "../workspaces";

export type DaemonFixture = {
  base_dir: string;
  user_data_dir: string;
  workspace_root: string;
  workspace: Workspace;
  registry: WorkspaceRegistry;
  write_workspace_file: (relPath: string, content: string) => Promise<void>;
  cleanup: () => Promise<void>;
};

export async function createDaemonFixture(
  prefix = "grida-agent-test-"
): Promise<DaemonFixture> {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const userDataDir = path.join(baseDir, "userdata");
  const workspaceDir = path.join(baseDir, "workspace");
  await fs.mkdir(userDataDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });

  const workspaceRoot = await fs.realpath(workspaceDir);
  const registry = new WorkspaceRegistry(userDataDir);
  const workspace = await registry.open(workspaceRoot);

  return {
    base_dir: baseDir,
    user_data_dir: userDataDir,
    workspace_root: workspaceRoot,
    workspace,
    registry,
    write_workspace_file: async (relPath, content) => {
      const fullPath = path.join(workspaceRoot, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content, "utf8");
    },
    cleanup: async () => {
      await fs.rm(baseDir, { recursive: true, force: true });
    },
  };
}
