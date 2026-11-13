import { dotcanvas } from "dotcanvas";
import type { BundleBackend } from "./backend";

/**
 * Adapt a {@link BundleBackend} to the `dotcanvas` fs port. dotcanvas
 * addresses files root-relative *without* a leading slash (it reads/writes
 * `.canvas.json`), while the bundle backend uses leading-slash paths. The
 * adapter lives here, not in dotcanvas — dotcanvas is host-agnostic and
 * "not a filesystem"; path conventions are the host's concern.
 */
export function bundleFs(backend: BundleBackend): dotcanvas.WritableFs {
  return {
    list: () => backend.list(),
    read: (p) => backend.read(abs(p)),
    write: (p, c) => backend.write(abs(p), c),
  };
}

function abs(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}
