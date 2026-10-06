import { createHash, createHmac } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  transport: vi.fn<typeof fetch>(),
  refreshBalance: vi.fn<(organizationId: number) => Promise<unknown>>(),
}));
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
vi.mock("@/lib/billing/metronome", () => ({
  refreshBalance: fixture.refreshBalance,
}));
import { service_role } from "@/lib/supabase/server";
import { POST } from "../../app/(ingest)/webhooks/metronome/route";

const secret = "local-metronome-receiver-secret";
const event = {
  id: "evt_receiver_fixture",
  type: "commit.create",
  properties: { customer_id: "customer_fixture" },
};
function request(valid = true) {
  const raw = JSON.stringify(event),
    date = new Date().toUTCString();
  return new NextRequest("https://grida.example.test/webhooks/metronome", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      date,
      "Metronome-Webhook-Signature": createHmac(
        "sha256",
        valid ? secret : "wrong"
      )
        .update(date + "\n" + raw)
        .digest("hex"),
    },
    body: raw,
  });
}
function database(result = "processed", failApply = false) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  fixture.transport.mockImplementation(async (input, init) => {
    const req = new Request(input, init),
      url = new URL(req.url);
    expect(url.origin).toBe("https://supabase-fixture.invalid");
    expect(req.method).toBe("POST");
    expect(url.pathname.startsWith("/rest/v1/rpc/")).toBe(true);
    const name = url.pathname.slice("/rest/v1/rpc/".length);
    const args = await req.json();
    calls.push({ name, args });
    switch (name) {
      case "platform_source_webhook_capture":
        return Response.json({
          accepted: true,
          body_hash: createHash("sha256")
            .update(JSON.stringify(event))
            .digest("hex"),
        });
      case "platform_billing_owner":
        return Response.json({
          owner: "grida",
          phase: "active",
          quarantined: false,
        });
      case "fn_billing_apply_metronome_event":
        return failApply
          ? Response.json(
              { message: "fixture database failure", code: "P0001" },
              { status: 500 }
            )
          : Response.json([{ result, handler: "commit" }]);
      case "fn_billing_resolve_org_by_metronome_customer":
        return Response.json("42");
      default:
        throw new Error("Unexpected database operation: " + name);
    }
  });
  return calls;
}
beforeEach(() => {
  fixture.transport.mockReset();
  fixture.refreshBalance.mockReset();
  fixture.refreshBalance.mockResolvedValue(undefined);
  vi.stubEnv("METRONOME_WEBHOOK_SECRET", secret);
});
afterEach(() => vi.unstubAllEnvs());

describe("Metronome receiver with the actual SupabaseClient RPC method", () => {
  it("applies signed source-owned events and resolves refresh through receiver-bound RPCs", async () => {
    expect(service_role.workspace.rpc).toBe(SupabaseClient.prototype.rpc);
    const calls = database();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "processed" });
    expect(calls.map((call) => call.name)).toEqual([
      "platform_source_webhook_capture",
      "platform_billing_owner",
      "fn_billing_apply_metronome_event",
      "fn_billing_resolve_org_by_metronome_customer",
    ]);
    expect(calls[2].args).toEqual({
      p_event_id: event.id,
      p_event_type: event.type,
      p_payload: event,
    });
    expect(calls[3].args).toEqual({
      p_customer_id: event.properties.customer_id,
    });
    expect(fixture.refreshBalance).toHaveBeenCalledExactlyOnceWith(42);
  });
  it("returns the real database replay result without refreshing twice", async () => {
    const calls = database("replayed");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: "replayed" });
    expect(calls.map((call) => call.name)).toEqual([
      "platform_source_webhook_capture",
      "platform_billing_owner",
      "fn_billing_apply_metronome_event",
    ]);
    expect(fixture.refreshBalance).not.toHaveBeenCalled();
  });
  it("retains a failed database apply as HTTP 500 without refreshing", async () => {
    const calls = database("processed", true);
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "rpc failed" });
    expect(calls).toHaveLength(3);
    expect(fixture.refreshBalance).not.toHaveBeenCalled();
  });
  it("rejects an invalid signature before any database request", async () => {
    const calls = database();
    const response = await POST(request(false));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_signature" });
    expect(calls).toEqual([]);
    expect(fixture.transport).not.toHaveBeenCalled();
    expect(fixture.refreshBalance).not.toHaveBeenCalled();
  });
});
