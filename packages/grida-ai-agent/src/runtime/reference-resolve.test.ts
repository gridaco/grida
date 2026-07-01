import { describe, expect, it } from "vitest";
import { AgentVision } from "../vision";
import {
  ReferenceResolveError,
  resolveReference,
} from "./workspace-agent-bindings";

/** A ByteReader stub: maps a path to bytes (or absence / an oversize throw). */
function reader(
  files: Record<string, Uint8Array | "oversize">
): AgentVision.ByteReader {
  return {
    async readBytes(path) {
      const v = files[path];
      if (v === "oversize") throw new AgentVision.OversizeError(99);
      return v ?? null;
    },
  };
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x00]); // sniffs as image/jpeg
const NO_READER = reader({});

describe("resolveReference", () => {
  it("passes an https URL straight through (no read)", async () => {
    expect(await resolveReference("https://x/y.png", NO_READER)).toBe(
      "https://x/y.png"
    );
  });

  it("passes a data URL straight through", async () => {
    const u = "data:image/png;base64,Zm9v";
    expect(await resolveReference(u, NO_READER)).toBe(u);
  });

  it("reads a path and inlines it as a base64 data URL", async () => {
    const url = await resolveReference(
      "pins/ref.jpg",
      reader({ "pins/ref.jpg": JPEG })
    );
    expect(url).toBe(
      `data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`
    );
  });

  it("errors clearly when the reference is empty", async () => {
    await expect(resolveReference("   ", NO_READER)).rejects.toBeInstanceOf(
      ReferenceResolveError
    );
  });

  it("errors clearly when a path is not found", async () => {
    await expect(
      resolveReference("pins/missing.png", NO_READER)
    ).rejects.toThrowError(/not found/i);
  });

  it("errors clearly when a path is not an image", async () => {
    await expect(
      resolveReference(
        "pins/notes.txt",
        reader({ "pins/notes.txt": new Uint8Array([1, 2, 3]) })
      )
    ).rejects.toThrowError(/not a supported image/i);
  });

  it("errors clearly when a path is too large", async () => {
    await expect(
      resolveReference("pins/huge.png", reader({ "pins/huge.png": "oversize" }))
    ).rejects.toThrowError(/too large/i);
  });
});
