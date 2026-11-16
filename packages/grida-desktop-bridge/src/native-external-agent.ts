// GRIDA-SEC-004 — renderer-safe observations of a reviewed, local ACP peer.
export type NativeExternalRun = Readonly<{
  runId: string;
  disposition:
    | "starting"
    | "running"
    | "not_dispatched"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "uncertain";
  text: string | null;
  responseTruncated: boolean;
  cleanupVerified: boolean;
}>;

export type NativeExternalStatus = Readonly<{
  name: string;
  run: NativeExternalRun | null;
}>;

/** One text task for the selected workspace's reviewed offline peer. */
export type DesktopNativeExternalAgent = Readonly<{
  status(): Promise<NativeExternalStatus | null>;
  start(runId: string, text: string): Promise<NativeExternalRun>;
  stop(runId: string): Promise<NativeExternalRun>;
}>;
