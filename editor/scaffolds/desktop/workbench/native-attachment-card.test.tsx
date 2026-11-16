import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMessageView } from "@/kits/agent-chat/message";
import { native_message_parts } from "@/lib/agent-chat/native-message-parts";
import { ComposerAttachmentCard } from "@/kits/composer";
import { NativeAttachmentCard } from "./native-attachment-card";

describe("native folder reference presentation", () => {
  it("shows a draft folder as a resource without a byte size, preview or grant claim", () => {
    const html = renderToStaticMarkup(
      <NativeAttachmentCard
        name="research"
        mimeType="inode/directory"
        png={false}
        preview={null}
        onRemove={() => {}}
      />
    );
    expect(html).toContain("research");
    expect(html).toContain("Folder");
    expect(html).toContain("lucide-folder");
    expect(html).not.toContain("read only");
    expect(html).not.toContain("DIRECTORY");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("0 B");
  });

  it("keeps the existing read-only scope card distinct from a folder reference", () => {
    const html = renderToStaticMarkup(
      <ComposerAttachmentCard
        attachment={{
          kind: "directory",
          id: "scope-card",
          name: "Additional source",
          ref: {
            kind: "scope",
            id: "opaque",
            name: "Additional source",
            path: "/mount/source",
            access: "read",
          },
        }}
        onRemove={() => {}}
      />
    );
    expect(html).toContain("Folder · read only");
  });

  it("shows a replayed folder in the sent message without inventing a preview or grant", () => {
    const html = renderToStaticMarkup(
      <ChatMessageView
        message={{
          id: "sent-folder",
          role: "user",
          parts: native_message_parts.of({
            messageId: "sent-folder",
            role: "user",
            text: "Inspect the sources.",
            attachments: [{ name: "research", mimeType: "inode/directory" }],
          }),
        }}
      />
    );
    expect(html).toContain("research");
    expect(html).toContain("Folder");
    expect(html).toContain("lucide-folder");
    expect(html).not.toContain("read only");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("0 B");
  });
});
