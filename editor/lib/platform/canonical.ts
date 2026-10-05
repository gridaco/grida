import { createHash, timingSafeEqual } from "node:crypto";

const identity = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
const opaque = /^[A-Za-z0-9_-]{43,256}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const nonce = /^[A-Za-z0-9_-]{22,128}$/;
const maximumLifetime = 90 * 24 * 60 * 60 * 1000;
const maximumOverlap = 24 * 60 * 60 * 1000;
const audience = "platform.canonical";

type Key = {
  id: string;
  verifier_sha256: string;
  environment: string;
  audience: string;
  not_before: string;
  not_after: string;
  revoked: boolean;
};
export type CanonicalConfig = { environment: string; keys: unknown };
export type CanonicalRPC = (
  name:
    | "platform_gg_account_snapshots"
    | "platform_lifecycle_page"
    | "platform_lifecycle_ack",
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length &&
  keys.every((key) => key in value);

// Same receiving-key contract as infra/packages/go/workloadauth. Configuration
// contains hashes only; environment and audience never come from the caller.
export function canonicalVerifier(config: CanonicalConfig, now = Date.now()) {
  return workloadVerifier(config, audience, now);
}

export function workloadVerifier(
  config: CanonicalConfig,
  audience: string,
  now = Date.now()
) {
  if (
    !identity.test(config.environment) ||
    !Array.isArray(config.keys) ||
    config.keys.length < 1 ||
    config.keys.length > 128
  )
    throw new Error("invalid workload configuration");
  const ids = new Set<string>();
  const hashes = new Set<string>();
  const groups = new Map<string, Key[]>();
  const keys: Key[] = [];
  for (const raw of config.keys) {
    if (
      !object(raw) ||
      !exactKeys(raw, [
        "id",
        "verifier_sha256",
        "environment",
        "audience",
        "not_before",
        "not_after",
        "revoked",
      ])
    )
      throw new Error("invalid workload configuration");
    const key = raw as Key;
    if (
      typeof key.id !== "string" ||
      !identity.test(key.id) ||
      key.id.length > 64 ||
      typeof key.environment !== "string" ||
      !identity.test(key.environment) ||
      typeof key.audience !== "string" ||
      !identity.test(key.audience) ||
      typeof key.verifier_sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(key.verifier_sha256) ||
      typeof key.not_before !== "string" ||
      typeof key.not_after !== "string" ||
      typeof key.revoked !== "boolean" ||
      ids.has(key.id) ||
      hashes.has(key.verifier_sha256)
    )
      throw new Error("invalid workload configuration");
    const from = Date.parse(key.not_before),
      to = Date.parse(key.not_after);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      to - from > maximumLifetime
    )
      throw new Error("invalid workload configuration");
    ids.add(key.id);
    hashes.add(key.verifier_sha256);
    keys.push(key);
    if (!key.revoked) {
      const group = `${key.environment}\0${key.audience}`;
      groups.set(group, [...(groups.get(group) ?? []), key]);
    }
  }
  for (const group of groups.values()) {
    if (group.length > 2) throw new Error("invalid workload configuration");
    if (
      group.length === 2 &&
      Math.min(...group.map((k) => Date.parse(k.not_after))) -
        Math.max(...group.map((k) => Date.parse(k.not_before))) >
        maximumOverlap
    )
      throw new Error("invalid workload configuration");
  }
  if (
    !keys.some(
      (k) => k.environment === config.environment && k.audience === audience
    )
  )
    throw new Error("invalid workload configuration");
  return (headers: Headers): boolean => {
    const id = headers.get("x-grida-workload-key-id") ?? "";
    const authorization = headers.get("authorization") ?? "";
    if (
      !identity.test(id) ||
      id.length > 64 ||
      !authorization.startsWith("Bearer ")
    )
      return false;
    const secret = authorization.slice(7);
    if (!opaque.test(secret)) return false;
    const key = keys.find((k) => k.id === id);
    const match = timingSafeEqual(
      createHash("sha256").update(secret).digest(),
      Buffer.from(key?.verifier_sha256 ?? "0".repeat(64), "hex")
    );
    return (
      !!key &&
      match &&
      !key.revoked &&
      key.environment === config.environment &&
      key.audience === audience &&
      now >= Date.parse(key.not_before) &&
      now < Date.parse(key.not_after)
    );
  };
}

function reply(status: number, data: unknown) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function boundedJSON(request: Request): Promise<unknown> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new Error("invalid request");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("invalid request");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new Error("invalid request");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handleCanonical(
  request: Request,
  operation: string,
  config: CanonicalConfig,
  rpc: CanonicalRPC,
  now = Date.now()
) {
  let verify: (headers: Headers) => boolean;
  try {
    verify = canonicalVerifier(config, now);
  } catch {
    return reply(503, { error: "canonical_unavailable" });
  }
  if (!verify(request.headers))
    return reply(401, { error: "workload_unauthorized" });
  if (request.method !== "POST")
    return reply(405, { error: "method_not_allowed" });
  if (
    new URL(request.url).search ||
    request.headers.has("cookie") ||
    request.headers.has("origin")
  )
    return reply(400, { error: "invalid_request" });
  let name: Parameters<CanonicalRPC>[0];
  let args: Record<string, unknown>;
  try {
    const body = await boundedJSON(request);
    if (!object(body)) throw new Error();
    if (operation === "snapshots") {
      if (
        !exactKeys(body, ["organizations", "observation_id"]) ||
        typeof body.observation_id !== "string" ||
        !nonce.test(body.observation_id) ||
        !Array.isArray(body.organizations) ||
        body.organizations.length < 1 ||
        body.organizations.length > 100
      )
        throw new Error();
      const ids = new Set<string>();
      for (const org of body.organizations) {
        if (
          !object(org) ||
          !exactKeys(org, ["id"]) ||
          typeof org.id !== "string" ||
          !/^[1-9][0-9]{0,18}$/.test(org.id) ||
          BigInt(org.id) > 9223372036854775807n ||
          ids.has(org.id)
        )
          throw new Error();
        ids.add(org.id);
      }
      name = "platform_gg_account_snapshots";
      args = { refs: body.organizations, observation_id: body.observation_id };
    } else if (operation === "lifecycle") {
      if (
        !exactKeys(body, ["limit"]) ||
        !Number.isInteger(body.limit) ||
        (body.limit as number) < 1 ||
        (body.limit as number) > 100
      )
        throw new Error();
      name = "platform_lifecycle_page";
      args = { batch_limit: body.limit };
    } else if (operation === "lifecycle/ack") {
      if (
        !exactKeys(body, ["event_ids"]) ||
        !Array.isArray(body.event_ids) ||
        body.event_ids.length < 1 ||
        body.event_ids.length > 100 ||
        body.event_ids.some((id) => typeof id !== "string" || !uuid.test(id)) ||
        new Set(body.event_ids).size !== body.event_ids.length
      )
        throw new Error();
      name = "platform_lifecycle_ack";
      args = { event_ids: body.event_ids };
    } else return reply(404, { error: "not_found" });
  } catch {
    return reply(400, { error: "invalid_request" });
  }
  try {
    const { data, error } = await rpc(name, args);
    if (error || !object(data))
      return reply(503, { error: "canonical_unavailable" });
    return reply(200, data);
  } catch {
    return reply(503, { error: "canonical_unavailable" });
  }
}
