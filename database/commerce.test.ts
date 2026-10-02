import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./index";
import { GridaCommerceClient } from "./commerce";

type Reply = { data?: unknown; error?: unknown };
type Operation = {
  table: string;
  action: string;
  value?: unknown;
  options?: unknown;
  filters: Record<string, unknown>;
};

// Records only the caller-owned SDK seam; no database or network is involved.
function recorder(replies: Reply[]) {
  const operations: Operation[] = [];
  let cursor = 0;
  const rpc = vi
    .fn<(name: string, args: unknown, options?: unknown) => Promise<Reply>>()
    .mockResolvedValue({ data: [], error: null });
  const from = vi.fn<(table: string) => unknown>((table: string) => {
    const operation: Operation = { table, action: "select", filters: {} };
    const run = () => {
      operations.push(operation);
      if (cursor >= replies.length)
        throw new Error("Unexpected database operation");
      return Promise.resolve({ data: null, error: null, ...replies[cursor++] });
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => {
        operation.filters[key] = value;
        return query;
      },
      insert: (value: unknown) => {
        operation.action = "insert";
        operation.value = value;
        return query;
      },
      upsert: (value: unknown, options: unknown) => {
        operation.action = "upsert";
        operation.value = value;
        operation.options = options;
        return query;
      },
      single: run,
      // oxlint-disable-next-line unicorn/no-thenable -- The injected Supabase query is deliberately awaitable.
      then: (resolve: (value: Reply) => unknown) => run().then(resolve),
    };
    return query;
  });
  const client = { from, rpc } as unknown as SupabaseClient<
    Database,
    "grida_commerce"
  >;
  return { operations, rpc, from, client };
}

describe("GridaCommerceClient", () => {
  test("adjusts the lowest existing level before changing negative-stock policy", async () => {
    const db = recorder([
      { data: { id: 4 } },
      {
        data: {
          id: 4,
          levels: [
            { id: 8, available: 3 },
            { id: 9, available: -2 },
          ],
        },
      },
      {},
      {},
    ]);
    const commerce = new GridaCommerceClient(db.client, 10, 20);
    expect(commerce.client).toBe(db.client);
    expect(
      await commerce.upsertInventoryItem({
        sku: "option",
        level: { diff: 3, reason: "admin" },
        config: { upsert: true, allow_negative_inventory: false },
      })
    ).toEqual({ error: null });
    expect(db.operations.map(({ table, action }) => [table, action])).toEqual([
      ["inventory_item", "select"],
      ["inventory_item", "select"],
      ["inventory_level_commit", "insert"],
      ["inventory_item", "upsert"],
    ]);
    expect(db.operations[0].filters).toEqual({ store_id: 20, sku: "option" });
    expect(db.operations[2].value).toEqual({
      inventory_level_id: 9,
      diff: 3,
      reason: "admin",
    });
    expect(db.operations[3].value).toEqual({
      store_id: 20,
      sku: "option",
      is_negative_level_allowed: false,
    });
  });

  test("creates a missing item before applying its initial level, with no second upsert", async () => {
    const db = recorder([
      {},
      {},
      { data: { levels: [{ id: 5, available: 0 }] } },
      {},
    ]);
    const commerce = new GridaCommerceClient(db.client, 10, 20);
    await commerce.upsertInventoryItem({
      sku: "new",
      level: { diff: 5, reason: "initialize" },
      config: { upsert: true },
    });
    expect(db.operations.map(({ table, action }) => [table, action])).toEqual([
      ["inventory_item", "select"],
      ["inventory_item", "upsert"],
      ["inventory_item", "select"],
      ["inventory_level_commit", "insert"],
    ]);
    expect(db.operations[1].options).toEqual({ onConflict: "store_id, sku" });
  });

  test("returns a failed level commit without retrying or applying the later policy update", async () => {
    const failure = { code: "XX320", message: "inventory unavailable" };
    const db = recorder([
      { data: { id: 4 } },
      { data: { levels: [{ id: 5, available: 0 }] } },
      { error: failure },
    ]);
    expect(
      await new GridaCommerceClient(db.client, 10, 20).upsertInventoryItem({
        sku: "item",
        level: { diff: -1 },
        config: { upsert: true },
      })
    ).toEqual({ error: failure });
    expect(db.operations).toHaveLength(3);
    expect(
      db.operations.filter((operation) => operation.action === "upsert")
    ).toEqual([]);
  });

  test("fails before querying when an inventory operation has no store", async () => {
    const db = recorder([]);
    await expect(
      new GridaCommerceClient(db.client, 10).upsertInventoryItem({
        sku: "item",
      })
    ).rejects.toThrow("store_id is required");
    expect(db.from).not.toHaveBeenCalled();
  });

  test("retains private store and inventory reads with project/store scoping", async () => {
    const db = recorder([
      { data: { id: 20 } },
      { data: [] },
      { data: { id: 8 } },
    ]);
    const commerce = new GridaCommerceClient(db.client, 10, 20);
    await commerce.createStore({ name: "Store" });
    await commerce.fetchInventoryItems();
    await commerce.fetchInventoryItem({ sku: "item" });
    await commerce.fetchInventoryItemsRPC();
    expect(db.operations[0].value).toEqual({ name: "Store", project_id: 10 });
    expect(db.operations[1].filters).toEqual({ store_id: 20 });
    expect(db.operations[2].filters).toEqual({ store_id: 20, sku: "item" });
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith(
      "get_inventory_items_with_committed",
      { p_store_id: 20 },
      { get: true }
    );
  });

  test("retains product/options/value upsert order and returns the expanded product", async () => {
    const product = { id: 7, product_option: [{ id: 8 }] };
    const db = recorder([
      { data: { id: 7 } },
      { data: { id: 8, product_id: 7, store_id: 20 } },
      {},
      {},
      { data: product },
    ]);
    const result = await new GridaCommerceClient(
      db.client,
      10,
      20
    ).upsertProduct({
      name: "Shirt",
      sku: "shirt",
      options: { size: ["S", "M"] },
    });
    expect(result.data).toEqual(product);
    expect(db.operations.map(({ table, action }) => [table, action])).toEqual([
      ["product", "upsert"],
      ["product_option", "upsert"],
      ["product_option_value", "upsert"],
      ["product_option_value", "upsert"],
      ["product", "select"],
    ]);
    expect(db.operations[2].value).toEqual({
      option_id: 8,
      product_id: 7,
      store_id: 20,
      value: "S",
    });
    expect(db.operations[4].filters).toEqual({ id: 7 });
  });
});
