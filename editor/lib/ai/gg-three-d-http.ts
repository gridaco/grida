// GRIDA-GG: gateway — fixed server egress for metered Tripo operations.
// GRIDA-SEC-003 / GRIDA-SEC-006 — provider credentials never cross the asset lane.
import "server-only";
import { ProviderHttp } from "@grida/ai";
import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { Readable } from "node:stream";

/** This host admits named Tripo routes, not caller-selected fetch authority. */
export namespace GgThreeDHttp {
  export function create(key: string): ProviderHttp {
    return new ProviderHttp({
      request: (input, init) => execute("api", key, input, init),
      download: (input, init) => execute("asset", key, input, init),
    });
  }

  const blocked = new BlockList();
  for (const [address, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.88.99.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const)
    blocked.addSubnet(address, prefix, "ipv4");
  for (const [address, prefix] of [
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
  ] as const)
    blocked.addSubnet(address, prefix, "ipv6");
  const globalV6 = new BlockList();
  globalV6.addSubnet("2000::", 3, "ipv6");

  function fail(): never {
    // Never retain a raw Node error: it can contain an Authorization header or signed URL.
    throw new Error("provider_transport_failed");
  }

  async function resolve(hostname: string, signal: AbortSignal) {
    signal.throwIfAborted();
    const addresses = await new Promise<LookupAddress[]>((accept, reject) => {
      const stop = () =>
        finish(() => reject(new Error("provider_transport_failed")));
      const timer = setTimeout(stop, 5_000);
      const finish = (action: () => void) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", stop);
        action();
      };
      signal.addEventListener("abort", stop, { once: true });
      lookup(hostname, { all: true, verbatim: true }).then(
        (value) => finish(() => accept(value)),
        stop
      );
      if (signal.aborted) stop();
    });
    signal.throwIfAborted();
    if (!Array.isArray(addresses) || !addresses.length || addresses.length > 32)
      fail();
    for (const { address, family } of addresses) {
      if (isIP(address) !== family || (family !== 4 && family !== 6)) fail();
      if (
        family === 4
          ? blocked.check(address, "ipv4")
          : !globalV6.check(address, "ipv6") || blocked.check(address, "ipv6")
      )
        fail();
    }
    return addresses[0]!;
  }

  async function execute(
    lane: "api" | "asset",
    key: string,
    input: Parameters<typeof fetch>[0],
    init?: RequestInit
  ): Promise<Response> {
    try {
      if (typeof input !== "string" && !(input instanceof URL)) fail();
      const text = String(input);
      // eslint-disable-next-line no-control-regex -- no URL controls or whitespace.
      if (text.length > 16_384 || /[\x00-\x20\x7f]/.test(text)) fail();
      const url = new URL(text);
      if (
        url.protocol !== "https:" ||
        url.port ||
        url.username ||
        url.password ||
        url.hash
      )
        fail();
      if (init?.credentials && init.credentials !== "omit") fail();
      if (init?.redirect && !["error", "manual"].includes(init.redirect))
        fail();
      const method = init?.method ?? "GET";
      const headers = new Headers(init?.headers);
      const body = init?.body;
      if (lane === "api") {
        const post =
          method === "POST" &&
          (url.pathname === "/v3/files/presign" ||
            url.pathname === "/v3/animations/rig-check" ||
            url.pathname === "/v3/animations/rig" ||
            /^\/v3\/generation\/(?:text|image|multiview)-to-model$/.test(
              url.pathname
            ));
        const get =
          method === "GET" &&
          /^\/v3\/tasks\/[A-Za-z0-9_-]{1,105}$/.test(url.pathname);
        if (
          url.hostname !== "openapi.tripo3d.ai" ||
          url.search ||
          !(post || get)
        )
          fail();
        if (
          headers.get("authorization") !== `Bearer ${key}` ||
          headers.get("accept") !== "application/json"
        )
          fail();
        if (
          [...headers.keys()].some(
            (name) =>
              !["authorization", "accept", "content-type"].includes(name)
          )
        )
          fail();
        if (
          post
            ? typeof body !== "string" ||
              Buffer.byteLength(body) > 64 * 1024 ||
              headers.get("content-type") !== "application/json"
            : body != null
        )
          fail();
      } else {
        if (
          !["cdn.tripo3d.ai", "tripo-data.rg1.data.tripo3d.com"].includes(
            url.hostname
          ) ||
          method !== "GET" ||
          [...headers.keys()].length ||
          body != null
        )
          fail();
      }
      headers.set("accept-encoding", "identity");
      const signal = init?.signal ?? AbortSignal.timeout(600_000);
      const address = await resolve(url.hostname, signal);
      signal.throwIfAborted();
      return await new Promise<Response>((accept, reject) => {
        const routeOptions: https.RequestOptions & { autoSelectFamily: false } =
          {
            autoSelectFamily: false,
          };
        const client = https.request(
          {
            ...routeOptions,
            hostname: url.hostname,
            servername: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method,
            headers: Object.fromEntries(headers),
            // Pin the checked address while retaining the original TLS hostname.
            agent: false,
            family: address.family,
            rejectUnauthorized: true,
            maxHeaderSize: 32 * 1024,
            lookup: (_hostname, options, callback) => {
              if (signal.aborted)
                callback(
                  new Error("provider_transport_failed"),
                  "",
                  address.family
                );
              else if (options.all) callback(null, [address]);
              else callback(null, address.address, address.family);
            },
            signal,
          },
          (incoming) => {
            clearTimeout(connecting);
            try {
              signal.throwIfAborted();
              const status = incoming.statusCode ?? 0;
              // Redirects are never followed, including on the credential-free lane.
              if (
                status < 200 ||
                (status >= 300 && status < 400) ||
                status > 599
              )
                fail();
              const responseHeaders = new Headers();
              for (
                let index = 0;
                index < incoming.rawHeaders.length;
                index += 2
              ) {
                const name = incoming.rawHeaders[index]!;
                if (name.toLowerCase() !== "set-cookie")
                  responseHeaders.append(name, incoming.rawHeaders[index + 1]!);
              }
              const encoding = responseHeaders.get("content-encoding");
              if (encoding && encoding !== "identity") fail();
              const length = responseHeaders.get("content-length");
              if (
                length &&
                (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))
              )
                fail();
              const empty = status === 204 || status === 205;
              if (empty) incoming.destroy();
              const stream = empty
                ? null
                : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>);
              accept(
                new Response(stream, {
                  status,
                  headers: responseHeaders,
                })
              );
            } catch {
              incoming.destroy();
              reject(new Error("provider_transport_failed"));
            }
          }
        );
        const connecting = setTimeout(
          () => client.destroy(new Error("provider_transport_failed")),
          15_000
        );
        client.once("error", () => {
          clearTimeout(connecting);
          reject(new Error("provider_transport_failed"));
        });
        client.end(typeof body === "string" ? body : undefined);
      });
    } catch {
      return fail();
    }
  }
}
