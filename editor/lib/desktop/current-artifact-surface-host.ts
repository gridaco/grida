import type { AgentSurface } from "@grida/agent/surface";

/**
 * Surface host for a dedicated editor that already presents one artifact.
 *
 * There is no tab switch to perform: opening the current path activates the
 * existing surface, while any other path is unavailable in this window.
 */
export class CurrentArtifactSurfaceHost implements AgentSurface.Host {
  constructor(private readonly path: string) {
    if (!path.startsWith("/")) {
      throw new Error("surface path must be rooted in the agent filesystem");
    }
  }

  open(_path: string): void {
    // A dedicated editor has no alternate surface to switch to. Its current
    // artifact is already visible; requests for any other path are auxiliary
    // presentation hints and intentionally have no effect.
  }

  listOpen(): AgentSurface.Snapshot {
    return { active: this.path, open: [this.path] };
  }
}
