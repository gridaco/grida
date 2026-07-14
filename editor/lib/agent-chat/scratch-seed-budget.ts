import type { ScratchSeedEntry } from "@grida/agent";
import { decodedBytes } from "./image-attachment";

/** Shared client-side accounting for the daemon's atomic `scratch_seed` cap. */
export namespace ScratchSeedBudget {
  export type Limits = {
    maxFileBytes: number;
    maxFiles: number;
    maxTotalBytes: number;
  };

  /** Capacity already claimed by non-composer seeds in the same turn. */
  export type Reservation = {
    fileCount: number;
    totalBytes: number;
    paths: readonly string[];
  };

  export const NONE: Reservation = {
    fileCount: 0,
    totalBytes: 0,
    paths: [],
  };

  /** Account trusted, already-built seeds without retaining their bodies. */
  export function reserve(
    entries: readonly ScratchSeedEntry[] | undefined
  ): Reservation {
    if (!entries || entries.length === 0) return NONE;
    let totalBytes = 0;
    const paths: string[] = [];
    for (const entry of entries) {
      paths.push(entry.path);
      if ("base64" in entry) {
        totalBytes += decodedBytes(entry.base64);
      } else {
        totalBytes += new TextEncoder().encode(entry.text).byteLength;
      }
    }
    return { fileCount: entries.length, totalBytes, paths };
  }
}
