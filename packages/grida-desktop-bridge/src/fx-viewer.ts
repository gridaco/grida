/** Purpose-scoped FX operations for the admitted first-party workbench. */
export namespace DesktopFxViewer {
  export type Entry = Readonly<{
    kind: "service_entry";
    project_id: string;
    entry_kind: "plan" | "run";
    entry_id: string;
  }>;

  export type Preview =
    | { state: "service_ready"; url: string }
    | { state: "stopped" | "incompatible" | "unavailable" };

  export type FileRequest = Readonly<{ pageId: string; reference: unknown }>;

  export type Artifact = Readonly<{
    kind: "artifact";
    name: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    digest: string;
    base64: string;
  }>;

  export type File =
    | Artifact
    | Readonly<{
        kind: "source";
        relativePath: string;
        sourceMatch: "match" | "changed" | "unknown";
      }>;

  export type FileOutcome =
    | "unavailable"
    | "not_authorized"
    | "stale"
    | "unknown";

  export type FileResult =
    | { kind: "ready"; file: File }
    | { kind: FileOutcome };
}
