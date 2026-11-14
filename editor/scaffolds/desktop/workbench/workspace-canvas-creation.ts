import { dotcanvas } from "dotcanvas";
import { workspaces as workspacesNs } from "@/lib/desktop/bridge";
import {
  workspaceBundleFs,
  type WorkspaceFsClient,
} from "../canvas/workspace-bundle-fs";

/**
 * Creates a new `.canvas` bundle in a workspace: an empty one, or a copy of a
 * slides template's bundle.
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
   * (or the same sequence for another base name) from the occupied root entry
   * names. Comparison is case-insensitive because the common Desktop
   * filesystems are case-insensitive.
   */
  export function nextPath(
    existingNames: readonly string[],
    base = "Untitled"
  ): string {
    const occupied = new Set(existingNames.map((name) => name.toLowerCase()));

    // Among N occupied names, at least one of the first N + 1 candidates is
    // available. This keeps the scan finite without an arbitrary retry cap.
    for (let index = 1; index <= existingNames.length + 1; index++) {
      const candidate =
        index === 1 ? `${base}.canvas` : `${base} ${index}.canvas`;
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

  /**
   * Copy a template bundle's flat files into a new bundle at the workspace
   * root, named after the template. Slides are written before the manifest,
   * so an interrupted copy never leaves a manifest pointing at missing slides.
   * Returns the new bundle's workspace-relative path.
   */
  export async function copy(
    workspaceId: string,
    template: Readonly<{
      name: string;
      files: readonly Readonly<{ path: string; text: string }>[];
    }>,
    client: Client = workspacesNs
  ): Promise<string> {
    const files = template.files.filter(
      (file) =>
        file.path.length > 0 &&
        !file.path.includes("/") &&
        !file.path.includes("\\") &&
        file.path !== "." &&
        file.path !== ".."
    );
    const manifest = files.find(
      (file) => file.path === dotcanvas.MANIFEST_FILENAME
    );
    if (!manifest) throw new Error("The template has no deck manifest.");
    const base =
      template.name
        .replace(/\.canvas$/i, "")
        .replace(/[\\/]/g, "-")
        .trim() || "Untitled";
    const entries = await client.readdir(workspaceId);
    const relPath = nextPath(
      entries.map((entry) => entry.name),
      base
    );
    for (const file of files)
      if (file !== manifest)
        await client.writeFile(
          workspaceId,
          `${relPath}/${file.path}`,
          file.text
        );
    await client.writeFile(
      workspaceId,
      `${relPath}/${manifest.path}`,
      manifest.text
    );
    return relPath;
  }
}
