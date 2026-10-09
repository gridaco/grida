import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("../supabase/server", () => ({
  service_role: {
    workspace: {
      rpc: () => {
        throw new Error("explicit fixture RPC required");
      },
    },
  },
}));
import { sourceWebhook, type WebhookRPC } from "./webhook-forwarding";
const now = Date.now(),
  secret = "signed-fixture-secret",
  raw =
    ' {"id":"evt_fixture","type":"checkout.session.completed","data":{"label":"한글"}}\n';
const hash = createHash("sha256").update(raw).digest("hex");
const env = {
  STRIPE_WEBHOOK_SECRET: secret,
  METRONOME_WEBHOOK_SECRET: secret,
  GRIDA_PLATFORM_BILLING_ORIGIN: "https://billing.example.test",
  GRIDA_PLATFORM_INGRESS_KEY_ID: "source-ingress",
  GRIDA_PLATFORM_INGRESS_TOKEN: "x".repeat(43),
};
function request(provider: "stripe" | "metronome", body = raw) {
  const headers = new Headers({
    "content-type": "application/json",
    cookie: "must-not-forward",
  });
  if (provider === "stripe")
    headers.set(
      "stripe-signature",
      `t=${Math.floor(now / 1000)},v1=${createHmac("sha256", secret)
        .update(Math.floor(now / 1000) + "." + raw)
        .digest("hex")}`
    );
  else {
    const date = new Date(now).toUTCString();
    headers.set("date", date);
    headers.set(
      "metronome-webhook-signature",
      createHmac("sha256", secret)
        .update(date + "\n" + raw)
        .digest("hex")
    );
  }
  return new Request("https://grida.example.test/webhooks/" + provider, {
    method: "POST",
    headers,
    body,
  });
}
function fixture(phase = "draining", owner = "grida") {
  const rpc = vi.fn<WebhookRPC>(async (name) => ({
    data:
      name === "platform_billing_owner"
        ? { owner, phase, quarantined: false }
        : name === "platform_source_webhook_capture"
          ? { accepted: true, body_hash: hash }
          : { acknowledged: true },
    error: null,
  }));
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ accepted: true })
  );
  return { rpc, transport, env, now };
}
describe("signed source capture and forwarding", () => {
  it.each(["stripe", "metronome"] as const)(
    "archives and forwards exact %s bytes before ACK",
    async (provider) => {
      const f = fixture(),
        req = request(provider),
        result = await sourceWebhook(req, provider, f);
      expect(result?.status).toBe(200);
      expect(f.rpc.mock.calls.map((c) => c[0])).toEqual([
        "platform_source_webhook_capture",
        "platform_billing_owner",
        "platform_source_webhook_ack",
      ]);
      expect(f.rpc.mock.calls[0][1].raw_body).toBe(
        "\\x" + Buffer.from(raw).toString("hex")
      );
      const [url, init] = f.transport.mock.calls[0];
      expect(url).toBe(
        "https://billing.example.test/platform/v1/billing/ingress/source/" +
          provider
      );
      expect(Buffer.from(init?.body as Uint8Array).toString()).toBe(raw);
      const headers = new Headers(init?.headers);
      expect(headers.get("cookie")).toBeNull();
      expect(headers.get("x-grida-workload-key-id")).toBe("source-ingress");
      expect(
        headers.get(
          provider === "stripe"
            ? "stripe-signature"
            : "metronome-webhook-signature"
        )
      ).toBe(
        req.headers.get(
          provider === "stripe"
            ? "stripe-signature"
            : "metronome-webhook-signature"
        )
      );
      expect(init?.redirect).toBe("error");
    }
  );
  it("keeps source-owned processing only while active, after durable signed archive", async () => {
    const f = fixture("active");
    expect(await sourceWebhook(request("stripe"), "stripe", f)).toBeNull();
    expect(f.transport).not.toHaveBeenCalled();
    expect(f.rpc).toHaveBeenCalledTimes(2);
  });
  it.each(["stripe", "metronome"] as const)(
    "rejects tampered %s before any SQL or HTTP",
    async (provider) => {
      const f = fixture();
      expect(
        (await sourceWebhook(request(provider, raw + " "), provider, f))?.status
      ).toBe(400);
      expect(f.rpc).not.toHaveBeenCalled();
      expect(f.transport).not.toHaveBeenCalled();
    }
  );
  it("requires durable source custody before forwarding", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "outage" } });
    expect((await sourceWebhook(request("stripe"), "stripe", f))?.status).toBe(
      503
    );
    expect(f.transport).not.toHaveBeenCalled();
  });
  it("does not ACK a target timeout or non-success, and never resumes the source writer", async () => {
    const f = fixture("transferred", "infra");
    f.transport.mockResolvedValue(new Response(null, { status: 503 }));
    expect((await sourceWebhook(request("stripe"), "stripe", f))?.status).toBe(
      503
    );
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual([
      "platform_source_webhook_capture",
      "platform_billing_owner",
    ]);
  });
  it("does not ACK a successful HTTP status without the durable target receipt", async () => {
    const f = fixture("transferred", "infra");
    f.transport.mockResolvedValue(Response.json({ received: true }));
    expect((await sourceWebhook(request("stripe"), "stripe", f))?.status).toBe(
      503
    );
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual([
      "platform_source_webhook_capture",
      "platform_billing_owner",
    ]);
  });
  it("retains a retryable result when local ACK is lost after target acceptance", async () => {
    const f = fixture();
    f.rpc.mockImplementation(async (name) =>
      name === "platform_source_webhook_ack"
        ? { data: null, error: { code: "lost" } }
        : {
            data:
              name === "platform_billing_owner"
                ? { owner: "infra", phase: "transferred", quarantined: false }
                : { accepted: true, body_hash: hash },
            error: null,
          }
    );
    expect((await sourceWebhook(request("stripe"), "stripe", f))?.status).toBe(
      503
    );
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("fails closed on missing forwarding configuration during maintenance", async () => {
    const f = fixture();
    expect(
      (
        await sourceWebhook(request("stripe"), "stripe", {
          ...f,
          env: { ...env, GRIDA_PLATFORM_INGRESS_TOKEN: "" },
        })
      )?.status
    ).toBe(503);
    expect(f.transport).not.toHaveBeenCalled();
  });
});
