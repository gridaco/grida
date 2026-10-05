import {
  workloadVerifier,
  boundedJSON,
  type CanonicalConfig,
} from "./canonical";
export type ProductReceiptRPC = (
  name: "platform_product_usage_page" | "platform_product_usage_ack",
  args: Record<string, unknown>
) => Promise<{ data: unknown; error: unknown }>;
export async function handleProductReceipts(
  request: Request,
  operation: string,
  config: CanonicalConfig,
  rpc: ProductReceiptRPC
) {
  const reply = (status: number, data: unknown) =>
    Response.json(data, {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  let verify: (headers: Headers) => boolean;
  try {
    verify = workloadVerifier(config, "grida.product-receipts");
  } catch {
    return reply(503, { error: "product_receipts_unavailable" });
  }
  if (!verify(request.headers))
    return reply(401, { error: "workload_unauthorized" });
  if (request.method !== "POST")
    return reply(405, { error: "method_not_allowed" });
  if (
    new URL(request.url).search ||
    ["cookie", "origin", "x-grida-account-token", "x-grida-native-token"].some(
      (k) => request.headers.has(k)
    )
  )
    return reply(400, { error: "invalid_request" });
  let name: Parameters<ProductReceiptRPC>[0], args: Record<string, unknown>;
  try {
    const body = await boundedJSON(request);
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new Error();
    const record = body as Record<string, unknown>;
    if (operation === "receipts") {
      if (
        Object.keys(record).length !== 1 ||
        !Number.isInteger(record.limit) ||
        (record.limit as number) < 1 ||
        (record.limit as number) > 100
      )
        throw new Error();
      name = "platform_product_usage_page";
      args = { batch_limit: record.limit };
    } else if (operation === "receipts/ack") {
      if (
        Object.keys(record).length !== 1 ||
        !Array.isArray(record.event_ids) ||
        record.event_ids.length < 1 ||
        record.event_ids.length > 100 ||
        record.event_ids.some(
          (id) =>
            typeof id !== "string" ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
              id
            )
        ) ||
        new Set(record.event_ids).size !== record.event_ids.length
      )
        throw new Error();
      name = "platform_product_usage_ack";
      args = { event_ids: record.event_ids };
    } else return reply(404, { error: "not_found" });
  } catch {
    return reply(400, { error: "invalid_request" });
  }
  try {
    const { data, error } = await rpc(name, args);
    if (error || !data || typeof data !== "object") throw new Error();
    return reply(200, data);
  } catch {
    return reply(503, { error: "product_receipts_unavailable" });
  }
}
