// GRIDA-SEC-006 / GRIDA-SEC-011 — anonymous loopback metadata, never inference.
import assert from "node:assert/strict";
import { createServer } from "node:http";

export async function startAuthDiscovery({ port = 55438 } = {}) {
  const failures = [];
  const envelope = (data) => ({
    object: "list",
    revision: "auth.fixture.1",
    next_change_at: null,
    data,
  });
  const models = envelope([
    {
      id: "fixture/auth-text",
      object: "model",
      created: 0,
      owned_by: "fixture",
      gg: {
        kind: "text",
        interfaces: ["chat.completions"],
        input_modalities: ["text"],
        output_modalities: ["text"],
        operation_ids: [],
        capabilities: {},
        limits: { context_tokens: 8192, max_output_tokens: 1024 },
        request_schemas: {},
        card: { label: "Fixture text" },
      },
    },
  ]);
  const documents = new Map([
    ["/v1/models", models],
    ["/v1/endpoints", envelope([])],
    ["/schemas/operations.json", { $defs: {}, "x-gg-operations": [] }],
  ]);
  const server = createServer((req, res) => {
    const forbidden = Object.keys(req.headers).some((name) =>
      /^(?:authorization|cookie|proxy-authorization|x-api-key|x-grida-|x-gg-)/i.test(
        name
      )
    );
    if (
      req.method !== "GET" ||
      forbidden ||
      req.headers["transfer-encoding"] ||
      (req.headers["content-length"] !== undefined &&
        req.headers["content-length"] !== "0")
    ) {
      failures.push("Discovery must be GET without authority or a body");
      res.writeHead(400).end();
      return;
    }
    const document = documents.get(req.url);
    if (!document) {
      res.writeHead(404).end();
      return;
    }
    res
      .writeHead(200, {
        "content-type":
          req.url === "/schemas/operations.json"
            ? "application/schema+json"
            : "application/json",
        "cache-control": "no-store",
      })
      .end(JSON.stringify(document));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    assertClean: () =>
      assert.deepEqual(failures, [], "Discovery credential boundary violated"),
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  };
}
