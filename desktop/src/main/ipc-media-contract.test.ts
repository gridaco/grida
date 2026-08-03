// GRIDA-SEC-004 — native media IPC must never bypass the shared guard.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  new URL("./ipc-handlers.ts", import.meta.url),
  "utf8"
);

describe("durable media IPC registration", () => {
  it("registers every media operation through guarded IPC only", () => {
    for (const channel of [
      "MEDIA_LIST",
      "MEDIA_READ",
      "MEDIA_REVEAL",
      "MEDIA_OPEN_FOLDER",
    ]) {
      expect(source).toMatch(new RegExp(`guarded\\(IPC_CHANNELS\\.${channel}`));
      expect(source).not.toMatch(
        new RegExp(`ipcMain\\.handle\\(IPC_CHANNELS\\.${channel}`)
      );
    }
  });
});
