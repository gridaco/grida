import { afterEach, describe, expect, it, vi } from "vitest";

type Globals = typeof globalThis & { __gridaPublicModelReaderV1?: unknown };
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete (globalThis as Globals).__gridaPublicModelReaderV1;
});

describe("public catalogue server origin binding", () => {
  it("refuses production loopback HTTP even when the local flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GRIDA_AI_GATEWAY_ORIGIN", "http://127.0.0.1:8080");
    vi.stubEnv("GRIDA_AI_GATEWAY_ALLOW_LOCAL", "1");
    await expect(import("./server")).rejects.toThrow(
      "Invalid public Gateway origin"
    );
  });
  it("permits only explicitly configured local development HTTP and shares its reader", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GRIDA_AI_GATEWAY_ORIGIN", "http://localhost:8080");
    vi.stubEnv("GRIDA_AI_GATEWAY_ALLOW_LOCAL", "1");
    const first = await import("./server");
    vi.resetModules();
    const second = await import("./server");
    expect(first.publicModelsOrigin).toBe("http://localhost:8080");
    expect(first.readPublicModels).toBe(second.readPublicModels);
  });
});
