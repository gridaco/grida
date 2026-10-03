/** Canonical Forms API paths. Origins, requests and routing policy are host-owned. */
export namespace FormsApiPaths {
  export const prefix = "/v1/forms";

  function segment(value: string): string {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value === "." ||
      value === ".."
    ) {
      throw new TypeError("A Forms path identifier must be a nonempty segment");
    }
    return encodeURIComponent(value);
  }

  export function form(formId: string): string {
    return `${prefix}/${segment(formId)}`;
  }

  export function session(formId: string): string {
    return `${form(formId)}/session`;
  }

  export function submit(formId: string): string {
    return `${prefix}/submit/${segment(formId)}`;
  }

  export function field(sessionId: string, fieldId: string): string {
    return `${prefix}/session/${segment(sessionId)}/field/${segment(fieldId)}`;
  }

  export function fieldSearchMeta(sessionId: string, fieldId: string): string {
    return `${field(sessionId, fieldId)}/search/meta`;
  }

  export function fieldUploadSignedUrl(
    sessionId: string,
    fieldId: string
  ): string {
    return `${field(sessionId, fieldId)}/file/upload/signed-url`;
  }

  export function fieldPreviewPublicUrl(
    sessionId: string,
    fieldId: string
  ): string {
    return `${field(sessionId, fieldId)}/file/preview/public-url`;
  }

  export function emailChallengeStart(
    sessionId: string,
    fieldId: string
  ): string {
    return `${field(sessionId, fieldId)}/challenge/email/start`;
  }

  export function emailChallengeVerify(
    sessionId: string,
    fieldId: string
  ): string {
    return `${field(sessionId, fieldId)}/challenge/email/verify`;
  }

  export function emailChallengeState(
    sessionId: string,
    fieldId: string
  ): string {
    return `${field(sessionId, fieldId)}/challenge/email/state`;
  }

  /**
   * Test a parsed URL pathname for the exact product namespace.
   * This neither decodes aliases nor validates an operation or grants authority.
   */
  export function isPath(pathname: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
  }
}
