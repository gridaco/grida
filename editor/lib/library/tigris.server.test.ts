import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createServer, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { LibraryTigris } from "./tigris.server";
import { LibraryCAS } from "./cas";

describe("LibraryTigris", () => {
  type Stored = {
    body: Buffer;
    mime: string;
    checksum?: string;
    checksumType?: string;
    cache: string;
  };
  const objects = new Map<string, Stored>();
  const requests: {
    method: string;
    path: string;
    checksum?: string;
    condition?: string;
    expectContinue?: string;
  }[] = [];
  let dropResponse = false;
  let rejectBeforeBody = false;
  let stalledMethod: string | undefined;
  const stalledResponses: ServerResponse[] = [];
  const earlyResponses: boolean[] = [];
  let endpoint: string;
  let client: S3Client;
  let store: LibraryTigris;
  const bytes = Buffer.from("the exact generated image bytes");
  const key = () =>
    "/library/" + LibraryCAS.path(LibraryCAS.sha256Hex(bytes), "image/png");
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://localhost");
    const path = url.pathname;
    requests.push({
      method: req.method!,
      path,
      checksum: req.headers["x-amz-checksum-sha256"] as string,
      condition: req.headers["if-none-match"] as string,
      expectContinue: req.headers.expect,
    });
    if (stalledMethod === req.method && req.method !== "GET") {
      stalledResponses.push(res);
      req.resume();
      return;
    }
    if (req.method === "PUT") {
      if (rejectBeforeBody && objects.has(path)) {
        earlyResponses.push(req.complete);
        req.pause();
        res.writeHead(412, { connection: "close" });
        res.end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (objects.has(path) && req.headers["if-none-match"] === "*") {
        res.writeHead(412);
        res.end("<Error><Code>PreconditionFailed</Code></Error>");
        return;
      }
      const checksum = createHash("sha256").update(body).digest("base64");
      if (req.headers["x-amz-checksum-sha256"] !== checksum) {
        res.writeHead(400);
        res.end("<Error><Code>XAmzContentSHA256Mismatch</Code></Error>");
        return;
      }
      objects.set(path, {
        body,
        mime: req.headers["content-type"]!,
        checksum,
        checksumType: "FULL_OBJECT",
        cache: req.headers["cache-control"]!,
      });
      if (dropResponse) {
        dropResponse = false;
        req.socket.destroy();
        return;
      }
      res.writeHead(200);
      res.end();
      return;
    }
    const object = objects.get(path);
    if (!object) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader("content-length", object.body.length);
    res.setHeader("content-type", object.mime);
    if (object.checksum)
      res.setHeader("x-amz-checksum-sha256", object.checksum);
    if (object.checksumType)
      res.setHeader("x-amz-checksum-type", object.checksumType);
    res.setHeader("cache-control", object.cache);
    res.writeHead(200);
    if (stalledMethod === "GET" && req.method === "GET") {
      stalledResponses.push(res);
      res.flushHeaders();
      res.write(object.body.subarray(0, 1));
      return;
    }
    res.end(req.method === "HEAD" ? undefined : object.body);
  });
  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    client = new S3Client({
      endpoint,
      region: "auto",
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: { accessKeyId: "local-only", secretAccessKey: "local-only" },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    store = new LibraryTigris(client, "library");
  });
  afterEach(() => {
    objects.clear();
    requests.length = 0;
    dropResponse = false;
    rejectBeforeBody = false;
    stalledMethod = undefined;
    stalledResponses.length = 0;
    earlyResponses.length = 0;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    client.destroy();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("sends exact bytes with a SHA-derived key, conditional create and a full checksum", async () => {
    const result = await store.upload(bytes, "image/png");
    expect(result).toEqual({
      path: key().slice("/library/".length),
      sha256: LibraryCAS.sha256Hex(bytes),
    });
    expect(objects.get(key())?.body).toEqual(bytes);
    expect(requests.map((r) => r.method)).toEqual(["PUT", "HEAD", "GET"]);
    expect(requests[0].condition).toBe("*");
    expect(requests[0].checksum).toBe(
      createHash("sha256").update(bytes).digest("base64")
    );
  });

  it("adopts an existing identical object without overwriting it", async () => {
    await store.upload(bytes, "image/png");
    const object = objects.get(key());
    await store.upload(bytes, "image/png");
    expect(objects.size).toBe(1);
    expect(objects.get(key())).toBe(object);
  });

  it("handles an immediate 412 before a large upload body is consumed", async () => {
    const large = Buffer.alloc(2 * 1024 * 1024, 42);
    const hash = LibraryCAS.sha256Hex(large);
    const path = "/library/" + LibraryCAS.path(hash, "image/png");
    const object: Stored = {
      body: large,
      mime: "image/png",
      checksum: createHash("sha256").update(large).digest("base64"),
      checksumType: "FULL_OBJECT",
      cache: "public, max-age=31536000, immutable",
    };
    objects.set(path, object);
    rejectBeforeBody = true;
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_BUCKET", "library");
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_ENDPOINT", endpoint);
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_ACCESS_KEY_ID", "local-only");
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_SECRET_ACCESS_KEY", "local-only");

    await expect(
      LibraryTigris.fromEnv().upload(large, "image/png")
    ).resolves.toEqual({ path: path.slice("/library/".length), sha256: hash });

    expect(earlyResponses.length).toBeGreaterThan(0);
    expect(earlyResponses.length).toBeLessThanOrEqual(3);
    expect(earlyResponses.every((complete) => !complete)).toBe(true);
    expect(requests.map((r) => r.method)).toEqual([
      ...earlyResponses.map(() => "PUT"),
      "HEAD",
      "GET",
    ]);
    expect(requests[0].condition).toBe("*");
    expect(requests[0].checksum).toBe(object.checksum);
    expect(requests[0].expectContinue).toBeUndefined();
    expect(objects.get(path)).toBe(object);
  });

  it("rejects a conflicting advertised SHA-256 checksum", async () => {
    await store.upload(bytes, "image/png");
    objects.get(key())!.checksum = createHash("sha256")
      .update("wrong")
      .digest("base64");
    await expect(store.upload(bytes, "image/png")).rejects.toThrow(
      "content address"
    );
  });

  it("adopts an existing object without checksum metadata after verifying its bytes", async () => {
    const object: Stored = {
      body: bytes,
      mime: "image/png",
      cache: "public, max-age=31536000, immutable",
    };
    objects.set(key(), object);

    await expect(store.upload(bytes, "image/png")).resolves.toEqual({
      path: key().slice("/library/".length),
      sha256: LibraryCAS.sha256Hex(bytes),
    });
    expect(requests.map((request) => request.method)).toEqual([
      "PUT",
      "HEAD",
      "GET",
    ]);
    expect(objects.get(key())).toBe(object);
  });

  it("rejects an advertised checksum type that does not describe the full object", async () => {
    await store.upload(bytes, "image/png");
    objects.get(key())!.checksumType = "COMPOSITE";
    await expect(store.upload(bytes, "image/png")).rejects.toThrow(
      "content address"
    );
  });

  it("rejects different stored bytes when checksum metadata is absent", async () => {
    const object: Stored = {
      body: Buffer.alloc(bytes.length, 0),
      mime: "image/png",
      cache: "public, max-age=31536000, immutable",
    };
    objects.set(key(), object);

    await expect(store.upload(bytes, "image/png")).rejects.toThrow(
      "content address"
    );
    expect(requests.map((request) => request.method)).toEqual([
      "PUT",
      "HEAD",
      "GET",
    ]);
    expect(objects.get(key())).toBe(object);
  });

  it("rejects different stored bytes even when HEAD echoes the expected checksum", async () => {
    await store.upload(bytes, "image/png");
    const object = objects.get(key())!;
    object.body = Buffer.alloc(bytes.length, 0);
    // Preserve the declared SHA, FULL_OBJECT type, MIME and length: metadata
    // alone must not authorize adopting these different bytes.
    requests.length = 0;
    await expect(store.upload(bytes, "image/png")).rejects.toThrow(
      /content address|[Cc]hecksum/
    );
    expect(requests.map((r) => r.method)).toEqual(["PUT", "HEAD", "GET"]);
    expect(objects.get(key())).toBe(object);
    expect(object.body).not.toEqual(bytes);
  });

  it("recovers a committed PUT whose response connection was lost", async () => {
    dropResponse = true;
    await expect(store.upload(bytes, "image/png")).resolves.toHaveProperty(
      "sha256",
      LibraryCAS.sha256Hex(bytes)
    );
    expect(objects.size).toBe(1);
    expect(requests.map((r) => r.method)).toEqual(["PUT", "HEAD", "GET"]);
  });

  it("allows exactly 30 MiB and rejects larger files before network I/O", async () => {
    const large = Buffer.alloc(LibraryTigris.maxBytes, 42);
    await store.upload(large, "image/png");
    expect([...objects.values()][0].body.length).toBe(LibraryTigris.maxBytes);
    requests.length = 0;
    await expect(
      store.upload(Buffer.alloc(LibraryTigris.maxBytes + 1), "image/png")
    ).rejects.toThrow("30 MiB");
    expect(requests).toHaveLength(0);
  });

  it.each(["PUT", "HEAD", "GET"])(
    "expires the shared upload deadline during a stalled %s",
    async (method) => {
      stalledMethod = method;
      vi.stubEnv("GRIDA_LIBRARY_TIGRIS_BUCKET", "library");
      vi.stubEnv("GRIDA_LIBRARY_TIGRIS_ENDPOINT", endpoint);
      vi.stubEnv("GRIDA_LIBRARY_TIGRIS_ACCESS_KEY_ID", "local-only");
      vi.stubEnv("GRIDA_LIBRARY_TIGRIS_SECRET_ACCESS_KEY", "local-only");
      const tigris = LibraryTigris.fromEnv();
      const timers = vi.spyOn(globalThis, "setTimeout");
      const pending = tigris.upload(bytes, "image/png");
      const settled = pending.catch((error: unknown) => error);
      const [expire, milliseconds] = timers.mock.calls[0];
      try {
        expect(milliseconds).toBe(LibraryTigris.uploadTimeoutMs);
        await vi.waitFor(() => expect(stalledResponses).toHaveLength(1));
        expire();
        expect(await settled).toEqual(new Error("Library upload timed out"));
        // The abort reaches the server socket asynchronously through the
        // client's fetch handler; allow for a loaded test runner.
        await vi.waitFor(
          () => expect(stalledResponses[0].destroyed).toBe(true),
          { timeout: 20_000 }
        );
        expect(requests.map((request) => request.method)).toEqual(
          ["PUT", "HEAD", "GET"].slice(
            0,
            ["PUT", "HEAD", "GET"].indexOf(method) + 1
          )
        );
      } finally {
        expire();
        await settled;
      }
    },
    30_000
  );

  it("expires even when response-body cancellation never settles", async () => {
    const cancel = vi.fn<() => Promise<void>>(
      () => new Promise<void>(() => {})
    );
    const body = new ReadableStream<Uint8Array>({ cancel });
    const checksum = createHash("sha256").update(bytes).digest("base64");
    vi.spyOn(client, "send")
      .mockImplementationOnce(async () => ({ $metadata: {} }))
      .mockImplementationOnce(async () => ({
        $metadata: {},
        ContentLength: bytes.length,
        ContentType: "image/png",
        ChecksumType: "FULL_OBJECT",
        ChecksumSHA256: checksum,
      }))
      .mockImplementationOnce(async () => ({
        $metadata: {},
        ContentLength: bytes.length,
        ContentType: "image/png",
        Body: {
          transformToWebStream: () => body,
        } as GetObjectCommandOutput["Body"],
      }));
    const timers = vi.spyOn(globalThis, "setTimeout");
    const pending = store.upload(bytes, "image/png");
    const settled = pending.catch((error: unknown) => error);
    const [expire] = timers.mock.calls[0];
    try {
      await vi.waitFor(() => expect(body.locked).toBe(true));
      expire();
      expect(await settled).toEqual(new Error("Library upload timed out"));
      expect(cancel).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
    } finally {
      expire();
      await settled;
    }
  });

  it("expires while SDK middleware is still waiting and prevents late follow-up requests", async () => {
    let finish: (() => void) | undefined;
    const send = vi.spyOn(client, "send").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({ $metadata: {} });
        })
    );
    const timers = vi.spyOn(globalThis, "setTimeout");
    const pending = store.upload(bytes, "image/png");
    const settled = pending.catch((error: unknown) => error);
    const [expire] = timers.mock.calls[0];
    try {
      expire();
      expect(await settled).toEqual(new Error("Library upload timed out"));
      finish?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(send).toHaveBeenCalledOnce();
      expect(requests).toHaveLength(0);
    } finally {
      expire();
      finish?.();
      await settled;
    }
  });

  it("requires dedicated runtime credentials and never falls back to another provider", () => {
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_BUCKET", "");
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_ACCESS_KEY_ID", "");
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_SECRET_ACCESS_KEY", "");
    expect(() => LibraryTigris.fromEnv()).toThrow("credentials");
  });
});
