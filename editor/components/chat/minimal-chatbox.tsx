"use client";

import React from "react";
import type { FileIO } from "@/lib/file";
import {
  ChatBox,
  ChatBoxHeader,
  ChatBoxTextArea,
  ChatBoxFooter,
  ChatBoxAttachmentPreview,
  ChatBoxSubmit,
  ChatBoxAttachmentUploader,
} from "./chatbox";

export function MinimalChatBox({
  disabled,
  onValueCommit,
  uploader,
  placeholder = "Chat with your prompt...",
  className,
  accept,
}: {
  disabled?: boolean;
  onValueCommit?: (value: { text: string; attachments: any[] }) => void;
  uploader?: FileIO.BucketFileUploaderFn;
  placeholder?: string;
  className?: string;
  accept?: string;
}) {
  return (
    <ChatBox
      disabled={disabled}
      onValueCommit={onValueCommit}
      uploader={uploader}
      placeholder={placeholder}
      accept={accept}
      className={className}
    >
      <ChatBoxHeader>
        <ChatBoxAttachmentPreview />
      </ChatBoxHeader>
      <ChatBoxTextArea />
      <ChatBoxFooter>
        <ChatBoxAttachmentUploader />
        <ChatBoxSubmit />
      </ChatBoxFooter>
    </ChatBox>
  );
}
