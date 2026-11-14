import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readLibraryAttachment } from "./attachment";

const { createLibraryClient } = vi.hoisted(() => ({
  createLibraryClient: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase/server", () => ({ createLibraryClient }));

const ID = "842a704f-f07c-403f-82eb-95696c65ded0";
const image = Uint8Array.of(82, 73, 70, 70, 87, 69, 66, 80);
const object = {
  path: "catalog/selected #image.webp",
  mimetype: "image/webp",
  bytes: image.byteLength,
  width: 10,
  height: 20,
  sha256: createHash("sha256").update(image).digest("hex"),
};

function catalog(asset = object, authorized = true) {
  const single = vi.fn<() => Promise<unknown>>().mockResolvedValue({
    data: asset,
    error: null,
  });
  const eq = vi.fn<(key: string, value: string) => unknown>(() => ({
    abortSignal: (_signal: AbortSignal) => ({ single }),
  }));
  createLibraryClient.mockResolvedValue({
    auth: {
      getUser: async () => ({
        data: { user: authorized ? { id: "fixture-user" } : null },
      }),
    },
    from: (_table: string) => ({ select: (_columns: string) => ({ eq }) }),
  });
  return { eq, single };
}

beforeEach(() => {
  createLibraryClient.mockReset();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://library-fixture.invalid");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("reads only the authenticated catalog object's public Library bytes", async () => {
  const { eq } = catalog();
  const storage = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(image, {
      headers: {
        "content-type": "image/webp",
        "content-length": `${image.byteLength}`,
      },
    })
  );
  vi.stubGlobal("fetch", storage);

  await expect(readLibraryAttachment(ID)).resolves.toEqual({
    mime: "image/webp",
    bytes: image.buffer,
  });
  expect(eq).toHaveBeenCalledExactlyOnceWith("id", ID);
  expect(storage).toHaveBeenCalledTimes(1);
  const [target, init] = storage.mock.calls[0];
  expect(String(target)).toBe(
    "https://library-fixture.invalid/storage/v1/object/public/library/catalog/selected%20%23image.webp"
  );
  expect(init).toMatchObject({
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  expect(init?.headers).toBeUndefined();
});

it("rejects URL inputs and unauthenticated catalog requests before storage", async () => {
  const { eq } = catalog(object, false);
  const storage = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", storage);

  await expect(
    readLibraryAttachment("https://outside.invalid/file")
  ).resolves.toBeNull();
  expect(createLibraryClient).not.toHaveBeenCalled();
  await expect(readLibraryAttachment(ID)).resolves.toBeNull();
  expect(eq).not.toHaveBeenCalled();
  expect(storage).not.toHaveBeenCalled();
});

it.each([
  { path: "../other/object.webp" },
  { path: "%2e%2e/other/object.webp" },
  { mimetype: "image/svg+xml" },
  { bytes: 4 * 1024 * 1024 + 1 },
  { width: 1_000_000 },
])(
  "rejects an ineligible catalog record before materializing it %j",
  async (changes) => {
    catalog({ ...object, ...changes });
    const storage = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", storage);

    await expect(readLibraryAttachment(ID)).resolves.toBeNull();
    expect(storage).not.toHaveBeenCalled();
  }
);

it("bounds bytes during streaming and refuses a changed recorded digest", async () => {
  catalog();
  const cancel = vi.fn<() => void>();
  const tooMuch = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(image.byteLength + 1));
    },
    cancel,
  });
  const headers = { "content-type": "image/webp" };
  const storage = vi.fn<typeof fetch>();
  storage.mockResolvedValueOnce(new Response(tooMuch, { headers }));
  storage.mockResolvedValueOnce(
    new Response(new Uint8Array(image.byteLength), { headers })
  );
  vi.stubGlobal("fetch", storage);

  await expect(readLibraryAttachment(ID)).resolves.toBeNull();
  expect(cancel).toHaveBeenCalledOnce();
  await expect(readLibraryAttachment(ID)).resolves.toBeNull();
});

it("rejects a redirect or a response with different content", async () => {
  catalog();
  const storage = vi.fn<typeof fetch>();
  storage.mockResolvedValueOnce(
    Response.redirect("https://outside.invalid/asset", 302)
  );
  storage.mockResolvedValueOnce(
    new Response(image, { headers: { "content-type": "text/html" } })
  );
  vi.stubGlobal("fetch", storage);

  await expect(readLibraryAttachment(ID)).resolves.toBeNull();
  await expect(readLibraryAttachment(ID)).resolves.toBeNull();
  expect(storage).toHaveBeenCalledTimes(2);
  for (const [url] of storage.mock.calls)
    expect(new URL(String(url)).hostname).toBe("library-fixture.invalid");
});
