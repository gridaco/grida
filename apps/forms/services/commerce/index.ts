import { Database } from "@/types/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import assert from "assert";

export class GridaCommerceClient {
  public readonly client: SupabaseClient<Database, "grida_commerce">;
  public readonly project_id: number;
  public readonly store_id?: number;

  constructor(
    client: SupabaseClient<Database, "grida_commerce">,
    project_id: number,
    store_id?: number
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

    const ii_upsertion = await this.client
      .from("inventory_item")
      .upsert(
        {
          store_id: this.store_id,
          sku: sku,
        },
        { onConflict: "store_id, sku" }
      )
      .select(`*, levels:inventory_level(*)`)
      .single();

    if (diff) {
      const { data: ii } = ii_upsertion;
      assert(ii, "failed to upsert inventory item");
      const { levels } = ii;

      // get the lowest `available` inventory level
      const { id: lowest_level_id } = levels.sort(
        (a, b) => a.available - b.available
      )[0];

      await this.adjustInventoryLevel(lowest_level_id, diff);
    }
  }

  async adjustInventoryLevel(inventory_level_id: number, diff: number) {
    return await this.client.from("inventory_level_commit").insert({
      inventory_level_id,
      diff,
    });
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
