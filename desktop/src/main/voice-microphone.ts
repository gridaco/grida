// GRIDA-SEC-004 — app microphone permission stays inside the admitted renderer.
import type { Session, WebContents } from "electron";
import { ipc_admission } from "./ipc-admission";
import { ipc_sender } from "./ipc-sender";

export function installVoiceMicrophonePolicy({
  session,
  editorOrigin,
  admitted,
  ready,
}: {
  session: Session;
  editorOrigin: string;
  admitted(sender: WebContents): boolean;
  ready(): boolean;
}) {
  function admittedPath(
    sender: WebContents | null,
    isMainFrame: boolean,
    requestingUrl: string | undefined
  ) {
    if (!sender || !isMainFrame || sender.isDestroyed() || !admitted(sender))
      return null;
    const url = sender.mainFrame.url;
    const pathname = ipc_sender.pathname(url);
    if (
      !ipc_sender.isAllowed(url, editorOrigin) ||
      (requestingUrl &&
        (!ipc_sender.isAllowed(requestingUrl, editorOrigin) ||
          ipc_sender.pathname(requestingUrl) !== pathname))
    )
      return null;
    return pathname;
  }

  session.setPermissionCheckHandler((sender, permission, origin, details) => {
    if (permission !== "media") return true;
    if (
      details.mediaType !== "audio" ||
      URL.parse(origin)?.origin !== editorOrigin
    )
      return false;
    const pathname = admittedPath(
      sender,
      details.isMainFrame,
      details.requestingUrl
    );
    return (
      pathname === "/desktop/settings" ||
      (ipc_admission.isVoiceComposer(pathname) && ready())
    );
  });

  session.setPermissionRequestHandler((sender, permission, reply, details) => {
    if (permission !== "media") return reply(true);
    const pathname = admittedPath(
      sender,
      details.isMainFrame,
      details.requestingUrl
    );
    reply(
      "mediaTypes" in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === "audio" &&
        ipc_admission.isVoiceComposer(pathname) &&
        ready()
    );
  });
}
