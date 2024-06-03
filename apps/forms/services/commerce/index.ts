import { Database } from "@/types/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import assert from "assert";

export class GridaCommerceClient {
  public readonly client: SupabaseClient<Database, "grida_commerce">;
  public readonly project_id: number;
  public readonly store_id?: number | null;

  constructor(
    client: SupabaseClient<Database, "grida_commerce">,
    project_id: number,
    store_id?: number | null
  ) {
    this.client = client;
    this.project_id = project_id;
    this.store_id = store_id;
  }

  async createStore({ name }: { name: string }) {
    return await this.client
      .from("store")
      .insert({
        name,
        project_id: this.project_id,
      })
      .select()
      .single();
  }

  /**
   * updates the inventory item without a product reference
   */
  async upsertInventoryItem({
    sku,
    level,
    config,
  }: {
    sku: string;
    level?: {
      diff: number;
      reason?: "admin" | "order" | "other" | "initialize";
    };
    config?: {
      /**
       * @default false
       */
      upsert?: boolean;
      /**
       * @default true
       */
      allow_negative_inventory?: boolean;
    };
  }) {
    let is_upserted = false;
    assert(this.store_id, "store_id is required");
    //

    const upsert = async (store_id: number) => {
      const { error: upsertion_error } = await this.client
        .from("inventory_item")
        .upsert(
          {
            store_id: store_id,
            sku: sku,
            is_negative_level_allowed:
              config?.allow_negative_inventory ?? undefined,
          },
          { onConflict: "store_id, sku" }
        );

      assert(!upsertion_error, "failed to upsert inventory item");
      is_upserted = true;
    };

    if (config?.upsert) {
      // although it's an upsert, we first will check if the inventory item exists.
      // this is because, the constraint on the table - is_negative_level_allowed
      // when user tries to update inverntory item 'available' from negative to possitive via commit, this will fail, because the upsertion places before the commit.
      // to address this, we first check if the inventory item exists, if not, we create it at the end of the function.
      const { data: existing } = await this.client
        .from("inventory_item")
        .select("id")
        .eq("store_id", this.store_id)
        .eq("sku", sku)
        .single();

      if (!existing) {
        await upsert(this.store_id);
      }
    }

    if (level) {
      const { diff, reason } = level;
      // we need to fetch the inventory item again to ensure the levels are updated.
      const ii_retrieval = await this.client
        .from("inventory_item")
        .select(`*, levels:inventory_level(*)`)
        .eq("store_id", this.store_id)
        .eq("sku", sku)
        .single();

      const { data: ii } = ii_retrieval;
      assert(ii, "failed to upsert inventory item");
      const { levels } = ii;

      assert(levels, "failed to fetch inventory levels");
      // get the lowest `available` inventory level
      const _sorted_levels = levels.sort((a, b) => a.available - b.available);

      assert(_sorted_levels.length, "no inventory levels found");

      const { id: lowest_level_id } = _sorted_levels[0];

      const { error: commit_error } = await this.adjustInventoryLevel(
        lowest_level_id,
        diff,
        reason
      );

      if (commit_error) return { error: commit_error };
    }

    if (config?.upsert && !is_upserted) {
      await upsert(this.store_id);
    }

    return { error: null };
  }

  async adjustInventoryLevel(
    inventory_level_id: number,
    diff: number,
    reason?: "admin" | "order" | "other" | "initialize"
  ) {
    return this.client.from("inventory_level_commit").insert({
      inventory_level_id,
      diff,
      reason: reason,
    });
  }

  async fetchInventoryItems() {
    assert(this.store_id, "store_id is required");
    return await this.client
      .from("inventory_item")
      .select(`*, levels:inventory_level(*)`)
      .eq("store_id", this.store_id);
  }

  /**
   * fetches inventory items using RPC for more detailed information
   * this includes committed (order) count along with available count
   */
  async fetchInventoryItemsRPC() {
    assert(this.store_id, "store_id is required");
    return await this.client.rpc("get_inventory_items_with_committed", {
      p_store_id: this.store_id,
    });
  }

  async fetchInventoryItem({ sku }: { sku: string }) {
    assert(this.store_id, "store_id is required");
    return await this.client
      .from("inventory_item")
      .select(`*, levels:inventory_level(*)`)
      .eq("store_id", this.store_id)
      .eq("sku", sku)
      .single();
  }

  async upsertProduct({
    name,
    sku,
    options,
  }: {
    name: string;
    sku: string;
    options?: { [name: string]: string[] };
  }) {
    assert(this.store_id, "store_id is required");
    assert(sku, "sku is required when upserting a product");

    const product_upsertion = await this.client
      .from("product")
      .upsert(
        {
          name: name,
          store_id: this.store_id,
          sku: sku,
        },
        {
          onConflict: "sku",
        }
      )
      .select()
      .single();

    if (!options) {
      return product_upsertion;
    }

    assert(product_upsertion.data, "failed to upsert product");

    for (const entry of Object.entries(options)) {
      const [option_name, values] = entry;

      // upsert option
      const { data: option, error: option_upsertion_error } = await this.client
        .from("product_option")
        .upsert(
          {
            name: option_name,
            product_id: product_upsertion.data.id,
            store_id: this.store_id,
          },
          {
            onConflict: "product_id, name",
          }
        )
        .select()
        .single();

      if (option_upsertion_error) console.error(option_upsertion_error);
      assert(option, "failed to upsert option");

      for (const value of values) {
        // upsert each value
        await this.client.from("product_option_value").upsert(
          {
            option_id: option.id,
            product_id: option.product_id,
            store_id: option.store_id,
            value: value,
          },
          {
            onConflict: "option_id, value",
          }
        );
      }
    }

    return this.client
      .from("product")
      .select(
        `
          *,
          product_option(*, product_option_value(*))
        `
      )
      .eq("id", product_upsertion.data.id)
      .single();
  }

  // async upsertProductOption() {}

  // async upsertProductOptionValue() {}
}
