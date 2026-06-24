import { AgentFs } from "@grida/agent/fs";
import { dotcanvas } from "dotcanvas";

// Consumer-side adapters that reconcile the demo's `AgentFs.Backend` (OPFS /
// memory) with the two fs consumers sitting on top of one `.canvas` bundle:
// `dotcanvas` (the manifest) and the AI copilot's `AgentFs` (the SVG
// documents). Both adapters live here, not in dotcanvas — dotcanvas is
// host-agnostic and "not a filesystem"; path conventions and agent-view
// filtering are the host's concern.

/** Strip a single leading "./" then "/". */
function bare(path: string): string {
  let p = path;
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1);
  return p;
}

function abs(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Adapt an `AgentFs.Backend` to the `dotcanvas` fs port. dotcanvas
 * addresses files root-relative *without* a leading slash (it reads/writes
 * `canvas.json`), while `AgentFs.Backend` (e.g. `OpfsBackend`) requires a
 * leading slash. This bridges the two path conventions.
 */
export function bundleFs(backend: AgentFs.Backend): dotcanvas.WritableFs {
  return {
    list: () => backend.list(),
    read: (p) => backend.read(abs(p)),
    write: (p, c) => backend.write(abs(p), c),
  };
}

/**
 * Wrap a bundle backend so the `.canvas` manifest (`canvas.json`) is invisible
 * to whatever `AgentFs` is built on top. The AI copilot operates on the SVG
 * documents only and must never see — or clobber — the manifest. The store
 * reads/writes the manifest directly via {@link bundleFs}, bypassing this view.
 */
export class ManifestHidingBackend implements AgentFs.Backend {
  constructor(private readonly inner: AgentFs.Backend) {}

  private isManifest(path: string): boolean {
    return bare(path) === dotcanvas.MANIFEST_FILENAME;
  }

  async list(): Promise<string[]> {
    return (await this.inner.list()).filter((p) => !this.isManifest(p));
  }
  async read(path: string): Promise<string | null> {
    return this.isManifest(path) ? null : this.inner.read(path);
  }
  async write(path: string, content: string): Promise<void> {
    if (this.isManifest(path)) return; // defensive: agent never writes the manifest
    return this.inner.write(path, content);
  }
  async delete(path: string): Promise<void> {
    if (this.isManifest(path)) return;
    return this.inner.delete(path);
  }
}
