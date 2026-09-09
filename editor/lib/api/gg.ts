// GRIDA-GG: token — fixed native mint HTTP adapter.
// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-012
import "server-only";
import { gg } from "../gg/gg";
import { ggData } from "../supabase/gg-data";
import { oauthServer } from "../auth/oauth-server";
import { nativeApi } from "./native";

export namespace ggApi {
  export function bind(operation: "gg.access") {
    if (operation !== "gg.access") throw new Error("Invalid GG API binding.");
    return nativeApi.bind(
      operation,
      "gg",
      input,
      async (organizationId, context) => {
        try {
          return await gg.mint(
            context.identity,
            ggData.forBearer(
              context.authorization,
              context.config,
              organizationId!,
              context.fetcher
            )
          );
        } catch (error) {
          if (error instanceof gg.MintError) {
            if (error.code === "rate_limited")
              throw new nativeApi.Failure("rate_limited");
            throw new oauthServer.Failure("forbidden");
          }
          if (error instanceof gg.TokenError && error.code === "not_configured")
            throw new nativeApi.Failure("not_configured");
          throw error;
        }
      }
    );
  }

  async function input(request: Request): Promise<number | null> {
    if (new URL(request.url).search)
      throw new oauthServer.Failure("invalid_request");
    if (request.method === "OPTIONS") {
      await nativeApi.emptyBody(request);
      return null;
    }
    const type = request.headers.get("content-type") ?? "";
    const encoding = request.headers.get("content-encoding");
    const length = request.headers.get("content-length");
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type) ||
      (encoding !== null && encoding !== "identity") ||
      (length !== null &&
        (!/^(?:0|[1-9]\d*)$/.test(length) ||
          Number(length) > 1024 ||
          request.headers.has("transfer-encoding"))) ||
      !request.body
    )
      throw new oauthServer.Failure("invalid_request");
    const reader = request.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const text = await Promise.race([
        (async () => {
          const chunks: Uint8Array[] = [];
          let size = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 1024) throw new oauthServer.Failure("invalid_request");
            chunks.push(value);
          }
          if (length !== null && Number(length) !== size)
            throw new oauthServer.Failure("invalid_request");
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        })(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new oauthServer.Failure("invalid_request")),
            1000
          );
        }),
      ]);
      // One canonical field/decimal integer; duplicate or escaped key aliases
      // cannot be interpreted differently by another JSON consumer.
      const match =
        /^[ \t\r\n]*\{[ \t\r\n]*"organization_id"[ \t\r\n]*:[ \t\r\n]*([1-9]\d*)[ \t\r\n]*\}[ \t\r\n]*$/.exec(
          text
        );
      const id = match ? Number(match[1]) : NaN;
      if (!Number.isSafeInteger(id) || id <= 0)
        throw new oauthServer.Failure("invalid_request");
      return id;
    } catch {
      throw new oauthServer.Failure("invalid_request");
    } finally {
      clearTimeout(timer);
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
}
