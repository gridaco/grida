// Retained source endpoints verify and archive through the actual Supabase RPC method.
import { createHash, createHmac } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ transport: vi.fn<typeof fetch>() }));
vi.mock("@/lib/supabase/server", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    service_role: {
      workspace: createClient(
        "https://supabase-fixture.invalid",
        "local-test-key",
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
          global: { fetch: fixture.transport },
        }
      ),
    },
  };
});
import { service_role } from "@/lib/supabase/server";
import { POST as metronome } from "../../app/(ingest)/webhooks/metronome/route";
import { POST as stripe } from "../../app/(ingest)/webhooks/stripe/route";

const secret = "local-source-receiver-signature-secret";
const event = {
  id: "evt_receiver_fixture",
  type: "commit.create",
  properties: { customer_id: "customer_fixture" },
};
const raw = JSON.stringify(event);
const hash = createHash("sha256").update(raw).digest("hex");
function request(
  provider: "stripe" | "metronome",
  valid = true,
  stale = false
) {
  const now = Date.now() - (stale ? 600_000 : 0);
  const headers = new Headers({
    "Content-Type": "application/json",
    cookie: "private-browser-cookie",
  });
  if (provider === "stripe") {
    const timestamp = Math.floor(now / 1000);
    const signature = createHmac("sha256", valid ? secret : "wrong")
      .update(`${timestamp}.${raw}`)
      .digest("hex");
    headers.set("Stripe-Signature", `t=${timestamp},v1=${signature}`);
  } else {
    const date = new Date(now).toUTCString();
    headers.set("Date", date);
    headers.set(
      "Metronome-Webhook-Signature",
      createHmac("sha256", valid ? secret : "wrong")
        .update(date + "\n" + raw)
        .digest("hex")
    );
  }
  return new NextRequest("https://grida.example.test/webhooks/" + provider, {
    method: "POST",
    headers,
    body: raw,
  });
}
function database(failure?: "capture" | "ack") {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  fixture.transport.mockImplementation(async (input, init) => {
    const req = new Request(input, init),
      url = new URL(req.url);
    expect(url.origin).toBe("https://supabase-fixture.invalid");
    expect(req.method).toBe("POST");
    expect(url.pathname.startsWith("/rest/v1/rpc/")).toBe(true);
    const name = url.pathname.slice("/rest/v1/rpc/".length);
    calls.push({ name, args: await req.json() });
    if (
      name !== "platform_source_webhook_capture" &&
      name !== "platform_source_webhook_ack"
    )
      throw new Error("Unexpected source writer: " + name);
    if (name === "platform_source_webhook_" + failure)
      return Response.json(
        { message: "private database failure", code: "P0001" },
        { status: 500 }
      );
    return Response.json(
      name.endsWith("capture")
        ? { accepted: true, body_hash: hash }
        : { acknowledged: true }
    );
  });
  return calls;
}
let forward: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  fixture.transport.mockReset();
  forward = vi.fn<typeof fetch>(async () => Response.json({ accepted: true }));
  vi.stubGlobal("fetch", forward);
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
  vi.stubEnv("METRONOME_WEBHOOK_SECRET", secret);
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "https://platform.example.test");
  vi.stubEnv("GRIDA_PLATFORM_INGRESS_KEY_ID", "source-ingress");
  vi.stubEnv("GRIDA_PLATFORM_INGRESS_TOKEN", "p".repeat(43));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe.each(["stripe", "metronome"] as const)(
  "%s retained source receiver",
  (provider) => {
    const POST = provider === "stripe" ? stripe : metronome;
    it("binds the real RPC receiver and archives exact signed bytes before target acceptance and source ACK", async () => {
      expect(service_role.workspace.rpc).toBe(SupabaseClient.prototype.rpc);
      const calls = database(),
        incoming = request(provider);
      const response = await POST(incoming);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: true });
      expect(calls.map(({ name }) => name)).toEqual([
        "platform_source_webhook_capture",
        "platform_source_webhook_ack",
      ]);
      expect(calls[0].args).toMatchObject({
        provider_name: provider,
        event_id: event.id,
        raw_body: "\\x" + Buffer.from(raw).toString("hex"),
      });
      expect(calls[1].args).toEqual({
        provider_name: provider,
        event_id: event.id,
        body_hash: hash,
      });
      const [url, init] = forward.mock.calls[0];
      expect(url).toBe(
        "https://platform.example.test/platform/v1/billing/ingress/source/" +
          provider
      );
      expect(Buffer.from(init!.body as Uint8Array).toString()).toBe(raw);
      const headers = new Headers(init!.headers);
      expect(headers.get("cookie")).toBeNull();
      const signedHeader =
        provider === "stripe"
          ? "stripe-signature"
          : "metronome-webhook-signature";
      expect(headers.get(signedHeader)).toBe(
        incoming.headers.get(signedHeader)
      );
      expect(init!.redirect).toBe("error");
      expect(fixture.transport.mock.invocationCallOrder[0]).toBeLessThan(
        forward.mock.invocationCallOrder[0]
      );
      expect(forward.mock.invocationCallOrder[0]).toBeLessThan(
        fixture.transport.mock.invocationCallOrder[1]
      );
    });
    it.each(["tampered", "expired"])(
      "rejects %s signatures before SQL or target HTTP",
      async (invalid) => {
        const calls = database();
        expect(
          (
            await POST(
              request(provider, invalid !== "tampered", invalid === "expired")
            )
          ).status
        ).toBe(400);
        expect(calls).toEqual([]);
        expect(forward).not.toHaveBeenCalled();
      }
    );
    it("fails closed without the retained source signing secret", async () => {
      vi.stubEnv(
        provider === "stripe"
          ? "STRIPE_WEBHOOK_SECRET"
          : "METRONOME_WEBHOOK_SECRET",
        ""
      );
      const calls = database();
      expect((await POST(request(provider))).status).toBe(503);
      expect(calls).toEqual([]);
      expect(forward).not.toHaveBeenCalled();
    });
    it("requires durable source capture before forwarding", async () => {
      const calls = database("capture");
      expect((await POST(request(provider))).status).toBe(503);
      expect(calls).toHaveLength(1);
      expect(forward).not.toHaveBeenCalled();
    });
    it("keeps retries possible when source ACK fails after target durable acceptance", async () => {
      const calls = database("ack");
      expect((await POST(request(provider))).status).toBe(503);
      expect(calls).toHaveLength(2);
      expect(forward).toHaveBeenCalledOnce();
    });
    it("never ACKs or invokes a retired writer after target failure", async () => {
      const calls = database();
      forward.mockResolvedValueOnce(
        new Response("private target failure", { status: 503 })
      );
      const response = await POST(request(provider));
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("private");
      expect(calls.map(({ name }) => name)).toEqual([
        "platform_source_webhook_capture",
      ]);
    });
    it("does not require retired outbound provider credentials", async () => {
      vi.stubEnv("STRIPE_SECRET_KEY", "");
      vi.stubEnv("METRONOME_API_TOKEN", "");
      database();
      expect((await POST(request(provider))).status).toBe(200);
    });
  }
);
