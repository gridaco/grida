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
  async upsertInventoryItem({ sku, diff }: { sku: string; diff?: number }) {
    assert(this.store_id, "store_id is required");
    //

    const upsert_result = await this.client.from("inventory_item").upsert(
      {
        store_id: this.store_id,
        sku: sku,
      },
      { onConflict: "store_id, sku" }
    );

    if (diff) {
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

      await this.adjustInventoryLevel(lowest_level_id, diff);
    }

    return upsert_result;
  }

  async adjustInventoryLevel(inventory_level_id: number, diff: number) {
    return await this.client.from("inventory_level_commit").insert({
      inventory_level_id,
      diff,
    });
  }

  async fetchInventoryItems() {
    assert(this.store_id, "store_id is required");
    return await this.client
      .from("inventory_item")
      .select(`*, levels:inventory_level(*)`)
      .eq("store_id", this.store_id);
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
