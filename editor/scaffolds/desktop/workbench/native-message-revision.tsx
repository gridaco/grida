"use client";

import { ChatMessageView } from "@/kits/agent-chat";

/** Presents the host-prepared revision in its user-message position. */
export function NativeMessageRevision({
  draft,
  submitting,
  effortAvailable,
  disconnected,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: {
    messageId: string;
    text: string;
    subsequentMessages: number;
    unverified: boolean;
    reviewExpired?: true;
    effort?: "ultra";
  };
  submitting: boolean;
  effortAvailable: boolean;
  disconnected: boolean;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const later = draft.subsequentMessages;
  const effortUnavailable = draft.effort === "ultra" && !effortAvailable;
  return (
    <ChatMessageView
      message={{
        id: draft.messageId,
        role: "user",
        parts: [{ type: "text", text: draft.text }],
      }}
      edit={{
        text: draft.text,
        submitting,
        readOnly: draft.unverified && !draft.reviewExpired,
        submitDisabled:
          effortUnavailable || disconnected || draft.reviewExpired,
        submitLabel: draft.unverified ? "Retry edit" : "Send",
        onChange,
        onCancel,
        onSubmit,
        note: (
          <>
            <p>
              {later > 0
                ? `Replaces this and ${later} later ${later === 1 ? "message" : "messages"}.`
                : "Replaces this message."}{" "}
              Completed work isn’t undone.
            </p>
            {draft.reviewExpired && (
              <p>
                The edit review expired when the chat reconnected. You can copy
                your edit, then cancel and review the saved message again.
              </p>
            )}
            {draft.effort === "ultra" && (
              <p>
                {effortUnavailable
                  ? "This message used Ultra effort, which is unavailable on the current connection."
                  : "This message keeps its original Ultra effort."}
              </p>
            )}
          </>
        ),
      }}
    />
  );
}
