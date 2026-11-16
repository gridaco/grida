// GRIDA-SEC-004 — workspace admission captures the selected directory inode.
import type { BigIntStats } from "node:fs";

export type WorkspaceDirectoryIdentity = Readonly<{
  device: string;
  inode: string;
  birthTimeNs: string;
}>;

export function directoryIdentity(
  stat: BigIntStats
): WorkspaceDirectoryIdentity {
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    birthTimeNs: stat.birthtimeNs.toString(),
  };
}

export function sameDirectoryIdentity(
  first: WorkspaceDirectoryIdentity,
  second: WorkspaceDirectoryIdentity
): boolean {
  return (
    first.device === second.device &&
    first.inode === second.inode &&
    first.birthTimeNs === second.birthTimeNs
  );
}
