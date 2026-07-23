import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import {
  workspaceBundleFs,
  type WorkspaceFsClient,
} from "../canvas/workspace-bundle-fs";

/**
 * Creates a new, empty `.canvas` bundle in a workspace.
 *
 * The bundle name is chosen from the workspace's immediate children, while the
 * manifest is written through dotcanvas's canonical serializer and the existing
 * workspace filesystem adapter. Writing the manifest also creates the missing
 * bundle directory.
 */
export namespace WorkspaceCanvasCreation {
  export type Editor = "board" | "slides";

  export type Client = {
    readdir(
      workspaceId: string,
      relPath?: string
    ): Promise<
      ReadonlyArray<{
        name: string;
        rel_path: string;
        kind: "file" | "directory" | "symlink" | "other";
      }>
    >;
    readFile: WorkspaceFsClient["readFile"];
    writeFile: WorkspaceFsClient["writeFile"];
  };

  /**
   * Pick `Untitled.canvas`, then `Untitled 2.canvas`, `Untitled 3.canvas`, ...
   * from the occupied root entry names. Comparison is case-insensitive because
   * the common Desktop filesystems are case-insensitive.
   */
  export function nextPath(existingNames: readonly string[]): string {
    const occupied = new Set(existingNames.map((name) => name.toLowerCase()));

    // Among N occupied names, at least one of the first N + 1 candidates is
    // available. This keeps the scan finite without an arbitrary retry cap.
    for (let index = 1; index <= existingNames.length + 1; index++) {
      const candidate =
        index === 1 ? "Untitled.canvas" : `Untitled ${index}.canvas`;
      if (!occupied.has(candidate.toLowerCase())) return candidate;
    }

    // The loop is exhaustive by the pigeonhole principle.
    throw new Error("Unable to choose an untitled canvas name.");
  }

  export async function create(
    workspaceId: string,
    editor: Editor,
    client: Client = workspacesNs
  ): Promise<string> {
    const entries = await client.readdir(workspaceId);
    const relPath = nextPath(entries.map((entry) => entry.name));

    await dotcanvas.write(workspaceBundleFs(workspaceId, client, relPath), {
      editor,
      documents: [],
    });

    return relPath;
  }
}
