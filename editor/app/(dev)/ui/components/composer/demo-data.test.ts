import { describe, expect, it } from "vitest";
import { AgentDirectoryReference } from "@/lib/agent-chat";
import { folders, resolveDropMode, toAttachment } from "./demo-data";

describe("composer demo directory fixtures", () => {
  it.each(folders)("uses a valid directory scope for $name", (folder) => {
    const attachment = toAttachment(folder);

    expect(attachment.kind).toBe("directory");
    if (attachment.kind !== "directory") return;

    expect(AgentDirectoryReference.isDescriptor(attachment.ref)).toBe(true);
    expect(resolveDropMode(folder, "auto")).toBe("card");
  });
});
