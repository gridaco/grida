import { describe, expect, it } from "vitest";
import { folders, resolveDropMode, toAttachment } from "./demo-data";

describe("composer demo directory fixtures", () => {
  it.each(folders)("attaches $name as a directory card", (folder) => {
    const attachment = toAttachment(folder);

    expect(attachment.kind).toBe("directory");
    expect(resolveDropMode(folder, "auto")).toBe("card");
  });
});
