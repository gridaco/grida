// GRIDA-SEC-012 — versioned public data does not acquire caller authority.
import { describe, expect, it, vi } from "vitest";
import { catalogApi } from "./catalog";
import { GET as legacy } from "../../app/(api)/(public)/api/v1/models/catalog/route";

const endpoint = "https://grida.co/api/v1/models/catalog/2";
const handlers = catalogApi.bind("models.catalog.v2");

describe("public model catalog", () => {
  it("publishes schema 2 identically without credentials or with unrelated headers", async () => {
    const response = await handlers.GET(new Request(endpoint));
    const text = await response.text();
    expect(response.headers.get("content-length")).toBe(
      String(Buffer.byteLength(text))
    );
    expect(response.headers.get("cache-control")).toContain("public");
    expect(response.headers.has("set-cookie")).toBe(false);
    const snapshot = JSON.parse(text);
    expect(snapshot.schema).toBe(2);
    expect(snapshot.text.tier_model_ids).toEqual({
      nano: "openai/gpt-6-luna",
      mini: "openai/gpt-6-sol",
      pro: "openai/gpt-6-sol",
      max: "openai/gpt-6-astra",
    });
    expect(snapshot.text.catalog["anthropic/claude-opus-5.5"]).toBeDefined();
    const unrelated = await handlers.GET(
      new Request(endpoint, {
        headers: {
          authorization: "Bearer synthetic-unrelated",
          cookie: "organization=other",
          "x-organization-id": "42",
        },
      })
    );
    expect(await unrelated.text()).toBe(text);
  });

  it("keeps the original endpoint compatible with released clients", async () => {
    const snapshot = await (await legacy()).json();
    expect(snapshot.schema).toBe(1);
    expect(snapshot.text.tier_model_ids.pro).toBe("openai/gpt-5.6-sol");
    for (const id of [
      "openai/gpt-6-sol",
      "openai/gpt-6-luna",
      "anthropic/claude-opus-5.5",
    ]) {
      expect(snapshot.text.catalog[id]).toBeUndefined();
    }
  });

  it("owns HEAD, OPTIONS and rejected methods/input", async () => {
    const head = await handlers.HEAD(new Request(endpoint, { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    const options = await handlers.OPTIONS(
      new Request(endpoint, { method: "OPTIONS" })
    );
    expect(options.status).toBe(204);
    expect(options.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const response = await handlers[method](
        new Request(endpoint, { method })
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(
      (await handlers.GET(new Request(endpoint + "?organization_id=42"))).status
    ).toBe(400);
    expect(
      (
        await handlers.OPTIONS(
          new Request(endpoint, { method: "OPTIONS", body: "input" })
        )
      ).status
    ).toBe(400);
    expect(
      (await handlers.GET(new Request(endpoint + "/unknown"))).status
    ).toBe(404);
  });

  it("accepts an empty OPTIONS stream and refuses streamed input without buffering", async () => {
    const empty = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    expect(
      (
        await handlers.OPTIONS(
          new Request(endpoint, {
            method: "OPTIONS",
            body: empty,
            duplex: "half",
          } as RequestInit)
        )
      ).status
    ).toBe(204);
    const cancel = vi.fn<() => void>();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel,
    });
    const result = await handlers.OPTIONS(
      new Request(endpoint, {
        method: "OPTIONS",
        body,
        duplex: "half",
      } as RequestInit)
    );
    expect(result.status).toBe(400);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("bounds a stalled OPTIONS body read and cancels it", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn<() => void>();
      const body = new ReadableStream<Uint8Array>({ cancel });
      const pending = handlers.OPTIONS(
        new Request(endpoint, {
          method: "OPTIONS",
          body,
          duplex: "half",
        } as RequestInit)
      );
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).status).toBe(400);
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
