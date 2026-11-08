// GRIDA-SEC-004 — anonymous, bounded GG metadata; never an execution credential.
/** Current offerings are owned by GG. Bundled model facts cannot enable a GG route. */
export const GG_DISCOVERY_ORIGIN = "https://gateway.grida.ai";
export type GGInterface =
  | "chat.completions"
  | "images.generations"
  | "videos"
  | "endpoints";
export type GGModel = Readonly<{
  id: string;
  label: string;
  kind: string;
  created: number;
  owned_by: string;
  interfaces: readonly string[];
  input_modalities: readonly string[];
  output_modalities: readonly string[];
  operation_ids: readonly string[];
  capabilities: Readonly<Record<string, boolean>>;
  limits: Readonly<Record<string, number>>;
  request_schemas: Readonly<Record<string, unknown>>;
}>;
export type GGEndpoint = Readonly<{
  id: string;
  model: string | null;
  operation: string;
  kind: string;
  variant: string;
  input_schema: Readonly<Record<string, unknown>>;
}>;
export type GGOperation = Readonly<{
  id: string;
  model_id: string;
  kind: string;
  variant: string;
  path: string;
  content_type: "application/json";
  response_mode: "synchronous" | "job";
  delivery: "transient_base64" | "provider_reference";
  input_schema: Readonly<Record<string, unknown>>;
}>;
export type GGDiscoverySnapshot = Readonly<{
  revision: string;
  models: readonly GGModel[];
  endpoints: readonly GGEndpoint[];
  operations: readonly GGOperation[];
  expires_at: number;
}>;
export type GGDiscoveryOptions = {
  /** Host-owned origin. Defaults to the public service, never a caller-supplied URL. */
  origin?: string;
  fetch?: typeof globalThis.fetch;
  on_change?: () => void;
  now?: () => number;
  /** Explicit offline hosts publish no current GG offering; never substitute a seed. */
  disabled?: boolean;
};
const FRESH_MS = 60_000;
const MAX_AGE_MS = 300_000;
const BACKOFF_MS = 5_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

/** One snapshot and one pending read per host, with no per-ID or per-account cache. */
export class GGDiscoveryStore {
  private current: GGDiscoverySnapshot | null = null;
  private freshUntil = 0;
  private retryAt = 0;
  private pending: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private readonly origin: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly now: () => number;
  constructor(private readonly options: GGDiscoveryOptions = {}) {
    const url = new URL(options.origin ?? GG_DISCOVERY_ORIGIN);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    )
      throw new Error("gg_invalid_discovery_origin");
    this.origin = url.origin;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }
  view(): GGDiscoverySnapshot | null {
    return this.current && this.now() < this.current.expires_at
      ? this.current
      : null;
  }
  list(kind?: string): readonly GGModel[] {
    return (
      this.view()?.models.filter((model) => !kind || model.kind === kind) ?? []
    );
  }
  model(id: string): GGModel | undefined {
    return this.view()?.models.find((model) => model.id === id);
  }
  supports(id: string, iface: GGInterface): boolean {
    return this.model(id)?.interfaces.includes(iface) === true;
  }
  async ready(): Promise<GGDiscoverySnapshot | null> {
    await this.refresh();
    return this.view();
  }
  refresh(): Promise<boolean> {
    if (this.pending) return this.pending;
    if (
      this.disposed ||
      this.options.disabled ||
      this.now() < this.retryAt ||
      this.now() < this.freshUntil
    )
      return Promise.resolve(false);
    this.pending = this.read().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }
  start(): void {
    if (this.timer || this.disposed || this.options.disabled) return;
    void this.refresh();
    this.timer = setInterval(() => {
      void this.refresh();
    }, FRESH_MS);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }
  dispose(): void {
    this.disposed = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private async read(): Promise<boolean> {
    const started = this.now();
    try {
      const [models, endpoints, bundle] = await Promise.all([
        this.json("/v1/models", 1024),
        this.json("/v1/endpoints", 2048),
        this.json("/schemas/operations.json"),
      ]);
      if (models.value.revision !== endpoints.value.revision) throw 0;
      const change = Math.min(
        nextChange(models.value),
        nextChange(endpoints.value)
      );
      const expires = Math.min(
        started + MAX_AGE_MS - Math.max(models.age, endpoints.age, bundle.age),
        change
      );
      if (expires <= this.now()) throw 0;
      const snapshot = freeze({
        revision: models.value.revision as string,
        models: (models.value.data as unknown[]).map(parseModel),
        endpoints: (endpoints.value.data as unknown[]).map(parseEndpoint),
        operations: parseOperations(
          bundle.value,
          models.value.data as unknown[],
          endpoints.value.data as unknown[]
        ),
        expires_at: expires,
      });
      unique(snapshot.models);
      unique(snapshot.endpoints);
      if (this.disposed) return false;
      this.current = snapshot;
      this.freshUntil = Math.min(
        started + FRESH_MS - Math.max(models.age, endpoints.age, bundle.age),
        expires
      );
      this.retryAt = 0;
      try {
        this.options.on_change?.();
      } catch {
        /* host notification cannot invalidate applied metadata */
      }
      return true;
    } catch {
      this.retryAt = this.now() + BACKOFF_MS;
      return false;
    }
  }
  private async json(path: string, maxItems?: number) {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      if (!reader) return;
      // Host transports can ignore cancellation; cleanup cannot hold the cache's
      // single-flight promise or its bounded deadline open.
      try {
        void reader.cancel().catch(() => {});
      } catch {
        /* best effort */
      }
      try {
        reader.releaseLock();
      } catch {
        /* pending host reads are untrusted */
      }
    };
    const read = async () => {
      const response = await this.fetcher(new URL(path, this.origin), {
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: {
          Accept:
            path === "/schemas/operations.json"
              ? "application/schema+json"
              : "application/json",
        },
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        try {
          void response.body?.cancel().catch(() => {});
        } catch {
          /* late response cleanup */
        }
        throw new Error("gg_discovery_unavailable");
      }
      reader = response.body?.getReader();
      if (!reader) throw new Error("gg_discovery_unavailable");
      const media = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase();
      const expected =
        path === "/schemas/operations.json"
          ? "application/schema+json"
          : "application/json";
      if (!response.ok || media !== expected)
        throw new Error("gg_discovery_unavailable");
      const bytes = new Uint8Array(MAX_BODY_BYTES);
      let size = 0;
      let reads = 0;
      for (;;) {
        // A hostile stream of ready/empty chunks must yield so the deadline can
        // run. Bytes and retained snapshot size are independently bounded.
        if (++reads % 64 === 0)
          await new Promise((resolve) => setTimeout(resolve, 0));
        controller.signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (size + value.byteLength > MAX_BODY_BYTES)
          throw new Error("gg_discovery_unavailable");
        bytes.set(value, size);
        size += value.byteLength;
      }
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, size)
        )
      );
      if (!record(value)) throw new Error("gg_discovery_unavailable");
      if (
        maxItems !== undefined &&
        (value.object !== "list" ||
          !text(value.revision) ||
          !Array.isArray(value.data) ||
          value.data.length > maxItems)
      )
        throw new Error("gg_discovery_unavailable");
      const date = Date.parse(response.headers.get("date") ?? "");
      const ageHeader = response.headers.get("age");
      const age =
        ageHeader && /^\d+$/.test(ageHeader) ? Number(ageHeader) * 1000 : 0;
      return {
        value,
        age: Math.max(
          age,
          Number.isFinite(date) ? Math.max(0, this.now() - date) : 0
        ),
      };
    };
    try {
      return await Promise.race([
        read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error("gg_discovery_unavailable"));
          }, 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      controller.abort();
      cancel();
    }
  }
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512;
}
function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 2048 && value.every(text);
}
function parseModel(value: unknown): GGModel {
  if (
    !record(value) ||
    !text(value.id) ||
    value.object !== "model" ||
    !record(value.gg)
  )
    throw 0;
  const gg = value.gg;
  if (
    !text(gg.kind) ||
    !strings(gg.interfaces) ||
    !strings(gg.input_modalities) ||
    !strings(gg.output_modalities) ||
    !strings(gg.operation_ids) ||
    !record(gg.capabilities) ||
    !record(gg.limits) ||
    !record(gg.request_schemas) ||
    !record(gg.card) ||
    !text(gg.card.label)
  )
    throw 0;
  if (
    !Object.values(gg.capabilities).every((v) => typeof v === "boolean") ||
    !Object.values(gg.limits).every(
      (v) => typeof v === "number" && Number.isFinite(v) && v >= 0
    )
  )
    throw 0;
  const limits = gg.limits;
  return {
    id: value.id,
    label: gg.card.label,
    kind: gg.kind,
    created: typeof value.created === "number" ? value.created : 0,
    owned_by: text(value.owned_by) ? value.owned_by : value.id.split("/")[0],
    interfaces: gg.interfaces.filter(
      (iface) =>
        iface !== "chat.completions" ||
        [limits.context_tokens, limits.max_output_tokens].every(
          (limit) =>
            typeof limit === "number" &&
            Number.isSafeInteger(limit) &&
            limit > 0
        )
    ),
    input_modalities: gg.input_modalities,
    output_modalities: gg.output_modalities,
    operation_ids: gg.operation_ids,
    capabilities: gg.capabilities as Record<string, boolean>,
    limits: gg.limits as Record<string, number>,
    request_schemas: gg.request_schemas,
  };
}
function parseEndpoint(value: unknown): GGEndpoint {
  if (
    !record(value) ||
    !text(value.id) ||
    !/^[A-Za-z0-9._-]{1,160}$/.test(value.id) ||
    (value.model !== null && !text(value.model)) ||
    !text(value.operation) ||
    !text(value.kind) ||
    !text(value.variant) ||
    !record(value.input_schema)
  )
    throw 0;
  return {
    id: value.id,
    model: value.model,
    operation: value.operation,
    kind: value.kind,
    variant: value.variant,
    input_schema: value.input_schema,
  };
}
function nextChange(value: Record<string, unknown>): number {
  if (value.next_change_at === null) return Infinity;
  if (
    typeof value.next_change_at !== "string" ||
    !Number.isFinite(Date.parse(value.next_change_at))
  )
    throw 0;
  return Date.parse(value.next_change_at);
}
function unique(values: readonly { id: string }[]): void {
  if (new Set(values.map((v) => v.id)).size !== values.length) throw 0;
}
function freeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === "object" && !seen.has(value)) {
    seen.add(value);
    for (const item of Object.values(value)) freeze(item, seen);
    Object.freeze(value);
  }
  return value;
}

function parseOperations(
  bundle: Record<string, unknown>,
  models: unknown[],
  endpoints: unknown[]
): GGOperation[] {
  const definitions = bundle.$defs;
  const operations = bundle["x-gg-operations"];
  if (
    !record(definitions) ||
    !Array.isArray(operations) ||
    operations.length > 2048
  )
    throw 0;
  const active = new Map(
    models.map(parseModel).map((model) => [model.id, model])
  );
  const endpointMap = new Map(
    endpoints.map(parseEndpoint).map((endpoint) => [endpoint.id, endpoint])
  );
  const selected: GGOperation[] = [];
  for (const value of operations) {
    if (
      !record(value) ||
      !text(value.operation_id) ||
      (value.model_id !== null && !text(value.model_id))
    )
      throw 0;
    if (value.model_id === null) continue; // Model-less structured features remain typed endpoints.
    const model = active.get(value.model_id);
    if (!model || !model.operation_ids.includes(value.operation_id)) continue;
    // Closed executable vocabulary. New transports or output types require client work.
    if (
      value.content_type !== "application/json" ||
      value.request_view !== "json" ||
      !["synchronous", "job"].includes(String(value.response_mode)) ||
      !["transient_base64", "provider_reference"].includes(
        String(value.delivery)
      ) ||
      !record(value.request_schema) ||
      typeof value.request_schema.$ref !== "string"
    )
      continue;
    const reference = value.request_schema.$ref;
    if (!/^#\/\$defs\/[^/]{1,200}$/.test(reference)) throw 0;
    if (!record(definitions[reference.slice(8)])) throw 0;
    const definition = localDefinition(value.request_schema, definitions);
    if (!definition) continue;
    const path = value.path;
    const iface =
      path === "/v1/images/generations"
        ? "images.generations"
        : path === "/v1/videos"
          ? "videos"
          : typeof path === "string" &&
              /^\/v1\/endpoints\/[A-Za-z0-9._-]{1,160}$/.test(path)
            ? "endpoints"
            : null;
    if (
      !iface ||
      !model.interfaces.includes(iface) ||
      value.kind !== model.kind ||
      !text(value.variant)
    )
      continue;
    if (iface === "endpoints") {
      const endpoint = endpointMap.get(
        (path as string).slice("/v1/endpoints/".length)
      );
      if (
        !endpoint ||
        endpoint.model !== model.id ||
        endpoint.operation !== value.operation_id
      )
        continue;
    } else {
      const properties = record(definition.properties)
        ? definition.properties
        : null;
      if (
        !properties ||
        !record(properties.model) ||
        properties.model.const !== model.id
      )
        continue;
    }
    const compatible =
      iface === "images.generations"
        ? value.kind === "image" &&
          value.response_mode === "synchronous" &&
          value.delivery === "transient_base64"
        : iface === "videos"
          ? value.kind === "video" &&
            value.response_mode === "job" &&
            value.delivery === "provider_reference"
          : value.response_mode === "job" &&
            value.delivery === "provider_reference" &&
            (value.kind === "music" || value.kind === "three-d");
    if (
      !compatible ||
      !record(value.result_schema) ||
      typeof value.result_schema.$ref !== "string"
    )
      continue;
    if (!supportsResult(value.result_schema, definitions, iface, value.kind))
      continue;
    selected.push({
      id: value.operation_id,
      model_id: model.id,
      kind: value.kind,
      variant: value.variant,
      path: path as string,
      content_type: "application/json",
      response_mode: value.response_mode as "synchronous" | "job",
      delivery: value.delivery as "transient_base64" | "provider_reference",
      input_schema: { ...definition, $defs: definitions },
    });
  }
  unique(selected);
  return selected;
}

/** Resolve only bounded local schema references; no remote schema execution. */
function localDefinition(
  schema: Record<string, unknown>,
  definitions: Record<string, unknown>,
  depth = 0
): Record<string, unknown> | null {
  if (depth > 16) return null;
  if (typeof schema.$ref !== "string") return schema;
  if (!/^#\/\$defs\/[^/]{1,200}$/.test(schema.$ref)) return null;
  const value = definitions[schema.$ref.slice(8)];
  if (!record(value)) return null;
  const resolved = localDefinition(value, definitions, depth + 1);
  if (!resolved) return null;
  const { $ref: _reference, ...constraints } = schema;
  // $ref siblings intersect with their target. This small native admission
  // reader cannot flatten conflicting keywords without weakening one side.
  // Withhold those shapes; never replace a referenced requirement/type/const.
  for (const [key, constraint] of Object.entries(constraints)) {
    if (Object.hasOwn(resolved, key) && resolved[key] !== constraint)
      return null;
  }
  return { ...resolved, ...constraints };
}

function supportsResult(
  schema: Record<string, unknown>,
  definitions: Record<string, unknown>,
  iface: string,
  kind: unknown
): boolean {
  const result = localDefinition(schema, definitions);
  const field =
    iface === "images.generations"
      ? "data"
      : iface === "videos"
        ? "videos"
        : kind === "music"
          ? "audio"
          : "glb";
  if (
    !result ||
    result.type !== "object" ||
    !record(result.properties) ||
    !Array.isArray(result.required) ||
    !result.required.includes(field) ||
    !record(result.properties[field])
  )
    return false;
  let item = localDefinition(result.properties[field], definitions);
  if (iface === "images.generations" || iface === "videos") {
    if (!item || item.type !== "array" || !record(item.items)) return false;
    item = localDefinition(item.items, definitions);
  }
  const payload = iface === "images.generations" ? "b64_json" : "url";
  if (
    !item ||
    item.type !== "object" ||
    !record(item.properties) ||
    !Array.isArray(item.required) ||
    !item.required.includes(payload) ||
    !record(item.properties[payload])
  )
    return false;
  const representation = localDefinition(item.properties[payload], definitions);
  if (representation?.type !== "string") return false;
  if (iface !== "endpoints") return true;
  if (
    !item.required.includes("media_type") ||
    !record(item.properties.media_type)
  )
    return false;
  return (
    localDefinition(item.properties.media_type, definitions)?.const ===
    (kind === "music" ? "audio/mpeg" : "model/gltf-binary")
  );
}

/** Common native controls can represent these required fields without model-specific code.
 * This checks the small input representation we implement, not arbitrary JSON Schema validity.
 * Unsupported required/composed shapes fail closed before a paid submission.
 */
export function supportsGGPromptOperation(
  operation: GGOperation,
  image = false
): boolean {
  const schema = operation.input_schema;
  const definitions = record(schema.$defs) ? schema.$defs : {};
  const fields = new Set(
    image ? ["model", "prompt", "image"] : ["model", "prompt"]
  );
  const properties = record(schema.properties) ? schema.properties : null;
  if (
    schema.type !== "object" ||
    !properties ||
    !record(properties.prompt) ||
    !stringInput(properties.prompt, definitions)
  )
    return false;
  if (
    image &&
    (!record(properties.image) || !stringInput(properties.image, definitions))
  )
    return false;
  const possibleFields = new Set([
    ...fields,
    ...(operation.kind === "image"
      ? ["n", "size", "aspect_ratio", "seed", "quality", "background"]
      : operation.kind === "video"
        ? [
            "duration",
            "seed",
            "fps",
            "generateAudio",
            "image",
            "aspectRatio",
            "aspect_ratio",
            "resolution",
            "providerOptions",
          ]
        : ["seed"]),
  ]);
  return nativeRequirements(schema, fields, definitions, 0, possibleFields);
}
function stringInput(
  schema: Record<string, unknown>,
  definitions: Record<string, unknown>
): boolean {
  const value = localDefinition(schema, definitions);
  return (
    !!value &&
    value.type === "string" &&
    !["allOf", "anyOf", "oneOf", "if", "then", "else"].some((key) =>
      Object.hasOwn(value, key)
    )
  );
}
function conditionCanMatch(
  schema: Record<string, unknown>,
  fields: ReadonlySet<string>,
  depth = 0
): boolean {
  if (depth > 16) return true;
  if (
    Array.isArray(schema.required) &&
    schema.required.some((key) => typeof key !== "string" || !fields.has(key))
  )
    return false;
  if (
    Array.isArray(schema.anyOf) &&
    !schema.anyOf.some(
      (branch) => record(branch) && conditionCanMatch(branch, fields, depth + 1)
    )
  )
    return false;
  if (
    Array.isArray(schema.allOf) &&
    !schema.allOf.every(
      (branch) => record(branch) && conditionCanMatch(branch, fields, depth + 1)
    )
  )
    return false;
  return true;
}
function nativeRequirements(
  schema: Record<string, unknown>,
  fields: ReadonlySet<string>,
  definitions: Record<string, unknown>,
  depth = 0,
  possibleFields: ReadonlySet<string> = fields
): boolean {
  if (depth > 16) return false;
  const value = localDefinition(schema, definitions);
  if (!value || (value.type !== undefined && value.type !== "object"))
    return false;
  if (
    value.required !== undefined &&
    (!Array.isArray(value.required) ||
      value.required.some((key) => typeof key !== "string" || !fields.has(key)))
  )
    return false;
  if (record(value.properties)) {
    for (const key of ["prompt", ...(fields.has("image") ? ["image"] : [])]) {
      if (
        Object.hasOwn(value.properties, key) &&
        (!record(value.properties[key]) ||
          !stringInput(value.properties[key], definitions))
      )
        return false;
    }
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    if (
      value[key] !== undefined &&
      (!Array.isArray(value[key]) ||
        !(value[key] as unknown[]).every(
          (branch) =>
            record(branch) &&
            nativeRequirements(
              branch,
              fields,
              definitions,
              depth + 1,
              possibleFields
            )
        ))
    )
      return false;
  }
  if (value.if !== undefined && !record(value.if)) return false;
  if (
    value.then !== undefined &&
    (!record(value.then) ||
      ((!record(value.if) || conditionCanMatch(value.if, possibleFields)) &&
        !nativeRequirements(
          value.then,
          fields,
          definitions,
          depth + 1,
          possibleFields
        )))
  )
    return false;
  if (
    value.else !== undefined &&
    (!record(value.else) ||
      !nativeRequirements(
        value.else,
        fields,
        definitions,
        depth + 1,
        possibleFields
      ))
  )
    return false;
  return true;
}
