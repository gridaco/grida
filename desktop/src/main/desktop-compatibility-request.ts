import { net } from "electron";

const HANDSHAKE_MAX_BYTES = 4_096;

/** Uses the hosted renderer's networking and exposes legacy redirects without following them. */
export function requestDesktopCompatibility(
  url: string,
  signal: AbortSignal
): Promise<Response> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const request = net.request({
      url,
      credentials: "omit",
      cache: "no-store",
      redirect: "manual",
      headers: { Accept: "application/json" },
    });
    const cleanup = () => signal.removeEventListener("abort", abort);
    const fail = (error: unknown) => {
      cleanup();
      reject(error);
    };
    const abort = () => {
      fail(signal.reason);
      request.abort();
    };
    const finish = (response: Response) => {
      cleanup();
      resolve(response);
    };
    signal.addEventListener("abort", abort, { once: true });
    request.once("error", fail);
    request.once("redirect", (status, _method, location) => {
      // net.fetch rejects manual redirects before exposing status or location.
      finish(new Response(null, { status, headers: { Location: location } }));
      request.abort();
    });
    request.once("response", (incoming) => {
      const status = incoming.statusCode;
      const type = incoming.headers["content-type"];
      if (
        status !== 200 ||
        typeof type !== "string" ||
        !type.startsWith("application/json")
      ) {
        finish(new Response(null, { status }));
        request.abort();
        return;
      }
      const bytes = new Uint8Array(HANDSHAKE_MAX_BYTES);
      let length = 0;
      incoming.once("error", fail);
      incoming.on("data", (chunk) => {
        if (length + chunk.length > bytes.length) {
          fail(new Error("Desktop compatibility response is too large"));
          request.abort();
          return;
        }
        bytes.set(chunk, length);
        length += chunk.length;
      });
      incoming.once("end", () =>
        finish(
          new Response(bytes.subarray(0, length), {
            status,
            headers: { "Content-Type": type },
          })
        )
      );
    });
    request.end();
  });
}
