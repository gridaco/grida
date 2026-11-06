import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalVerifier,
  workloadVerifier,
  handleCanonical,
  type CanonicalConfig,
  type CanonicalRPC,
} from "./canonical";
const now = Date.parse("2026-10-05T00:00:00Z");
const token = "a".repeat(43);
const key = {
  id: "canonical-1",
  verifier_sha256: createHash("sha256").update(token).digest("hex"),
  environment: "test",
  audience: "platform.canonical",
  not_before: "2026-10-04T00:00:00Z",
  not_after: "2026-10-06T00:00:00Z",
  revoked: false,
};
const config: CanonicalConfig = { environment: "test", keys: [key] };
const headers = () =>
  new Headers({
    Authorization: `Bearer ${token}`,
    "X-Grida-Workload-Key-ID": key.id,
    "Content-Type": "application/json",
  });
const body = { organizations: [{ id: "1" }], observation_id: "a".repeat(32) };
const request = (value: unknown = body, h = headers()) =>
  new Request("http://fixture.invalid/internal/platform/accounts/snapshots", {
    method: "POST",
    headers: h,
    body: JSON.stringify(value),
  });

describe("canonical workload boundary", () => {
  it("accepts exactly the fixed audience, environment and validity window", () => {
    expect(canonicalVerifier(config, now)(headers())).toBe(true);
    for (const patch of [
      { revoked: true },
      { environment: "prod" },
      { audience: "platform.billing" },
      { not_before: "2026-10-05T00:00:01Z" },
      { not_after: "2026-10-05T00:00:00Z" },
    ]) {
      const altered = { ...key, ...patch };
      const keys = [
        altered,
        ...(patch.environment || patch.audience
          ? [
              {
                ...key,
                id: "scope-placeholder",
                revoked: true,
                verifier_sha256: "1".repeat(64),
              },
            ]
          : []),
      ];
      expect(canonicalVerifier({ ...config, keys }, now)(headers())).toBe(
        false
      );
    }
  });
  it.each(["authorization", "x-grida-workload-key-id"])(
    "rejects missing or duplicate %s",
    (name) => {
      const h = headers();
      h.delete(name);
      expect(canonicalVerifier(config, now)(h)).toBe(false);
      const duplicate = headers();
      duplicate.append(name, duplicate.get(name)!);
      expect(canonicalVerifier(config, now)(duplicate)).toBe(false);
    }
  );
  it("rejects malformed manifests and cross-family reuse", () => {
    for (const keys of [
      [],
      [key, { ...key, id: "other" }],
      [{ ...key, not_after: "2027-10-01T00:00:00Z" }],
      [key, { ...key, id: "other", verifier_sha256: "1".repeat(64) }],
    ]) {
      expect(() => canonicalVerifier({ ...config, keys }, now)).toThrow(
        "invalid workload configuration"
      );
    }
  });
  it("requires explicit static lifetime for a credential without expiry", () => {
    const { not_after: _expiry, ...withoutExpiry } = key;
    expect(() =>
      canonicalVerifier({ ...config, keys: [withoutExpiry] }, now)
    ).toThrow("invalid workload configuration");
    expect(() =>
      canonicalVerifier(
        { ...config, keys: [{ ...withoutExpiry, lifetime: "bounded" }] },
        now
      )
    ).toThrow("invalid workload configuration");
    for (const lifetime of [null, "", "forever", 1, false]) {
      expect(() =>
        canonicalVerifier({ ...config, keys: [{ ...key, lifetime }] }, now)
      ).toThrow("invalid workload configuration");
    }
    const staticConfig = {
      ...config,
      keys: [{ ...withoutExpiry, lifetime: "static" }],
    };
    expect(canonicalVerifier(staticConfig, now)(headers())).toBe(true);
    expect(
      canonicalVerifier(staticConfig, now + 365 * 86400000)(headers())
    ).toBe(true);
    expect(
      canonicalVerifier(staticConfig, Date.parse(key.not_before) - 1)(headers())
    ).toBe(false);
    expect(
      canonicalVerifier(
        {
          ...config,
          keys: [{ ...withoutExpiry, lifetime: "static", revoked: true }],
        },
        now
      )(headers())
    ).toBe(false);
    expect(() =>
      canonicalVerifier(
        {
          ...config,
          keys: [
            {
              ...withoutExpiry,
              lifetime: "static",
              not_before: "0001-01-01T00:00:00Z",
            },
          ],
        },
        now
      )
    ).toThrow("invalid workload configuration");
    expect(() =>
      canonicalVerifier(
        {
          ...config,
          keys: [
            {
              ...withoutExpiry,
              lifetime: "static",
              not_before: "0000-01-01T00:00:00Z",
              not_after: "0001-01-01T00:00:00Z",
            },
          ],
        },
        now
      )
    ).toThrow("invalid workload configuration");
    for (const not_after of [null, "", "invalid", key.not_before]) {
      expect(() =>
        canonicalVerifier(
          {
            ...config,
            keys: [{ ...withoutExpiry, lifetime: "static", not_after }],
          },
          now
        )
      ).toThrow("invalid workload configuration");
    }
  });
  it("retains exclusive retirement deadlines on static credentials", () => {
    const retirement = "2027-10-01T00:00:00Z";
    const staticConfig = {
      ...config,
      keys: [{ ...key, lifetime: "static", not_after: retirement }],
    };
    expect(canonicalVerifier(staticConfig, now)(headers())).toBe(true);
    expect(
      canonicalVerifier(staticConfig, Date.parse(retirement))(headers())
    ).toBe(false);
    expect(
      canonicalVerifier(
        { ...config, keys: [{ ...key, lifetime: "bounded" }] },
        now
      )(headers())
    ).toBe(true);
  });
  it("keeps static rotation overlap bounded", () => {
    const { not_after: _expiry, ...withoutExpiry } = key;
    const next = {
      ...withoutExpiry,
      id: "next",
      verifier_sha256: "1".repeat(64),
      lifetime: "static",
    };
    expect(() =>
      canonicalVerifier(
        { ...config, keys: [{ ...withoutExpiry, lifetime: "static" }, next] },
        now
      )
    ).toThrow("invalid workload configuration");
    expect(() =>
      canonicalVerifier({ ...config, keys: [key, next] }, now)
    ).toThrow("invalid workload configuration");
    const retiring = {
      ...key,
      lifetime: "static",
      not_after: new Date(now + 24 * 3600000).toISOString(),
    };
    expect(
      canonicalVerifier(
        {
          ...config,
          keys: [
            retiring,
            { ...next, not_before: new Date(now).toISOString() },
          ],
        },
        now
      )(headers())
    ).toBe(true);
    expect(() =>
      canonicalVerifier(
        {
          ...config,
          keys: [
            retiring,
            next,
            { ...next, id: "third", verifier_sha256: "2".repeat(64) },
          ],
        },
        now
      )
    ).toThrow("invalid workload configuration");
  });
  it("permits bounded rotation overlap", () => {
    const keys = [
      key,
      {
        ...key,
        id: "next",
        verifier_sha256: "1".repeat(64),
        not_before: "2026-10-05T12:00:00Z",
        not_after: "2026-10-07T00:00:00Z",
      },
    ];
    expect(canonicalVerifier({ ...config, keys }, now)(headers())).toBe(true);
  });
});

describe("canonical fixed operations", () => {
  it("passes only fixed snapshot args and returns primary observation unchanged", async () => {
    const data = {
      schema_version: 1,
      observation_id: body.observation_id,
      observed_at: "2026-10-04T23:59:00Z",
      organizations: [],
    };
    const rpc = vi.fn<CanonicalRPC>().mockResolvedValue({ data, error: null });
    const response = await handleCanonical(
      request(),
      "snapshots",
      config,
      rpc,
      now
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(data);
    expect(rpc).toHaveBeenCalledWith("platform_gg_account_snapshots", {
      refs: body.organizations,
      observation_id: body.observation_id,
    });
  });
  it.each([
    { ...body, user_id: "forged" },
    { ...body, sql: "select 1" },
    { ...body, organizations: [{ id: "1", project_id: "2" }] },
    { ...body, organizations: [{ id: "01" }] },
    { ...body, organizations: [{ id: "9223372036854775808" }] },
    { ...body, organizations: [{ id: "1" }, { id: "1" }] },
    { ...body, organizations: [] },
    { ...body, observation_id: "short" },
  ])("rejects authority widening and malformed bodies %#", async (input) => {
    const rpc = vi.fn<CanonicalRPC>();
    expect(
      (await handleCanonical(request(input), "snapshots", config, rpc, now))
        .status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not touch service credentials before authentication", async () => {
    const rpc = vi.fn<CanonicalRPC>();
    const h = headers();
    h.set("authorization", `Bearer ${"b".repeat(43)}`);
    expect(
      (await handleCanonical(request(body, h), "snapshots", config, rpc, now))
        .status
    ).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds body size and rejects cookie/browser callers", async () => {
    const rpc = vi.fn<CanonicalRPC>();
    expect(
      (
        await handleCanonical(
          request({ ...body, huge: "x".repeat(32768) }),
          "snapshots",
          config,
          rpc,
          now
        )
      ).status
    ).toBe(400);
    const h = headers();
    h.set("cookie", "session=x");
    expect(
      (await handleCanonical(request(body, h), "snapshots", config, rpc, now))
        .status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("delivers and acknowledges explicit event identities", async () => {
    const rpc = vi
      .fn<CanonicalRPC>()
      .mockResolvedValue({ data: { acknowledged: true }, error: null });
    expect(
      (
        await handleCanonical(
          request({ limit: 10 }),
          "lifecycle",
          config,
          rpc,
          now
        )
      ).status
    ).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("platform_lifecycle_page", {
      batch_limit: 10,
    });
    const event_ids = ["00000000-0000-4000-8000-000000000001"];
    expect(
      (
        await handleCanonical(
          request({ event_ids }),
          "lifecycle/ack",
          config,
          rpc,
          now
        )
      ).status
    ).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("platform_lifecycle_ack", {
      event_ids,
    });
  });
  it("fails closed without exposing backend diagnostics", async () => {
    const rpc = vi.fn<CanonicalRPC>().mockResolvedValue({
      data: null,
      error: { message: "sensitive database error" },
    });
    const response = await handleCanonical(
      request(),
      "snapshots",
      config,
      rpc,
      now
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "canonical_unavailable" });
  });
});

type LifetimeFixture = {
  format: string;
  environment: string;
  audience: string;
  fixture_tokens: Record<string, string>;
  cases: {
    name: string;
    keys: Record<string, unknown>[];
    valid: boolean;
    checks?: {
      at: string;
      key_id: string;
      token_id: string;
      accepted: boolean;
    }[];
  }[];
};
const lifetimeFixture: LifetimeFixture = JSON.parse(
  readFileSync(
    new URL("./__fixtures__/workload-lifetime.json", import.meta.url),
    "utf8"
  )
);
const hasLifetimeReceiverScope = (example: LifetimeFixture["cases"][number]) =>
  example.keys.some(
    (k) =>
      k.environment === lifetimeFixture.environment &&
      k.audience === lifetimeFixture.audience
  );
const rejectedLifetimeCases = lifetimeFixture.cases.filter(
  (example) => !example.valid || !hasLifetimeReceiverScope(example)
);
const acceptedLifetimeCases = lifetimeFixture.cases.filter(
  (example) => example.valid && hasLifetimeReceiverScope(example)
);
function lifetimeVerifier(
  example: LifetimeFixture["cases"][number],
  at: string
) {
  return workloadVerifier(
    { environment: lifetimeFixture.environment, keys: example.keys },
    lifetimeFixture.audience,
    Date.parse(at)
  );
}
describe("workload lifetime conformance", () => {
  it("uses the versioned synthetic fixture", () => {
    expect(lifetimeFixture.format).toBe("workload-lifetime-v1");
    expect(lifetimeFixture.cases).toHaveLength(26);
  });
  it.each(rejectedLifetimeCases)("rejects $name", (example) => {
    expect(() => lifetimeVerifier(example, "2026-01-01T00:00:00Z")).toThrow(
      "invalid workload configuration"
    );
    // A syntactically valid manifest for another receiver still establishes
    // no authority here. Its probes must all remain rejected.
    expect((example.checks ?? []).every((probe) => !probe.accepted)).toBe(true);
  });
  it.each(acceptedLifetimeCases)("accepts $name", (example) => {
    expect(() =>
      lifetimeVerifier(example, "2026-01-01T00:00:00Z")
    ).not.toThrow();
    for (const probe of example.checks ?? []) {
      const token = lifetimeFixture.fixture_tokens[probe.token_id];
      expect(token).toBeDefined();
      const h = new Headers({
        authorization: `Bearer ${token}`,
        "x-grida-workload-key-id": probe.key_id,
      });
      expect(lifetimeVerifier(example, probe.at)(h)).toBe(probe.accepted);
    }
  });
});
