import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { verifyStripeWebhook } from "../billing";
import { service_role } from "../supabase/server";
import { configuredOrigin } from "./billing-consumer";

type Provider = "stripe" | "metronome";
export type WebhookRPC = (
  name:
    | "platform_billing_owner"
    | "platform_source_webhook_capture"
    | "platform_source_webhook_ack",
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const reply = (status: number, error: string) =>
  Response.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } }
  );

/** null retains the released source processor; a response terminates the route. */
export async function sourceWebhook(
  request: Request,
  provider: Provider,
  options: {
    env?: Record<string, string | undefined>;
    rpc?: WebhookRPC;
    transport?: typeof fetch;
    now?: number;
  } = {}
): Promise<Response | null> {
  const env = options.env ?? process.env;
  const rpc: WebhookRPC =
    options.rpc ??
    (async (name, args) =>
      await service_role.workspace.rpc(name as never, args as never));
  const transport = options.transport ?? fetch;
  const now = options.now ?? Date.now();
  let bytes: Buffer, event: Record<string, unknown>;
  const signedHeaders: Record<string, string> = {};
  try {
    const reader = request.clone().body?.getReader();
    if (!reader) return reply(400, "invalid_webhook");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1048576) throw new Error();
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    bytes = Buffer.concat(chunks);
    const secret =
      env[
        provider === "stripe"
          ? "STRIPE_WEBHOOK_SECRET"
          : "METRONOME_WEBHOOK_SECRET"
      ];
    if (!secret) return reply(503, "webhook_unavailable");
    if (provider === "stripe") {
      const signature = request.headers.get("stripe-signature");
      if (!signature || signature.length > 4096) throw new Error();
      event = (await verifyStripeWebhook(
        bytes,
        signature,
        secret,
        now
      )) as unknown as Record<string, unknown>;
      signedHeaders["stripe-signature"] = signature;
    } else {
      const signature = request.headers.get("metronome-webhook-signature"),
        date = request.headers.get("date");
      if (
        !signature ||
        !/^[0-9a-f]{64}$/.test(signature) ||
        !date ||
        !Number.isFinite(Date.parse(date)) ||
        Math.abs(now - Date.parse(date)) > 300000
      )
        throw new Error();
      const expected = createHmac("sha256", secret)
        .update(date + "\n")
        .update(bytes)
        .digest();
      if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
        throw new Error();
      event = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes)
      );
      signedHeaders["metronome-webhook-signature"] = signature;
      signedHeaders.date = date;
    }
    if (
      !object(event) ||
      typeof event.id !== "string" ||
      !event.id ||
      event.id.length > 256 ||
      typeof event.type !== "string"
    )
      throw new Error();
  } catch {
    return reply(400, "invalid_signature");
  }
  try {
    const captured = await rpc("platform_source_webhook_capture", {
      provider_name: provider,
      event_id: event.id,
      raw_body: "\\x" + bytes.toString("hex"),
      signature_headers: signedHeaders,
    });
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (
      captured.error ||
      !object(captured.data) ||
      captured.data.accepted !== true ||
      captured.data.body_hash !== hash
    )
      throw new Error();
    const owner = await rpc("platform_billing_owner", {});
    if (
      owner.error ||
      !object(owner.data) ||
      typeof owner.data.quarantined !== "boolean"
    )
      throw new Error();
    if (
      owner.data.owner === "grida" &&
      owner.data.phase === "active" &&
      !owner.data.quarantined
    )
      return null;
    if (
      !(
        owner.data.quarantined ||
        (owner.data.owner === "grida" && owner.data.phase === "draining") ||
        (owner.data.owner === "infra" && owner.data.phase === "transferred")
      )
    )
      throw new Error();
    const origin = configuredOrigin(env.GRIDA_PLATFORM_BILLING_ORIGIN, env),
      key = env.GRIDA_PLATFORM_INGRESS_KEY_ID,
      token = env.GRIDA_PLATFORM_INGRESS_TOKEN;
    if (
      !key ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(key) ||
      !token ||
      !/^[A-Za-z0-9_-]{43,256}$/.test(token)
    )
      throw new Error();
    const response = await transport(
      origin + "/platform/v1/billing/ingress/source/" + provider,
      {
        method: "POST",
        headers: {
          ...signedHeaders,
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
          "X-Grida-Workload-Key-ID": key,
        },
        body: Uint8Array.from(bytes),
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      }
    );
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error();
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 1024) throw new Error();
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    const receipt: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !object(receipt) ||
      Object.keys(receipt).length !== 1 ||
      receipt.accepted !== true
    )
      throw new Error();
    const ack = await rpc("platform_source_webhook_ack", {
      provider_name: provider,
      event_id: event.id,
      body_hash: hash,
    });
    if (ack.error || !object(ack.data) || ack.data.acknowledged !== true)
      throw new Error();
    return Response.json(
      { received: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return reply(503, "webhook_custody_unavailable");
  }
}
