import { Database } from "@/types/supabase";
import { SupabaseClient } from "@supabase/supabase-js";
import assert from "assert";

export class GridaFormsClient {
  public readonly client: SupabaseClient<Database, "grida_forms">;
  public readonly project_id: number;
  public readonly form_id?: string;

  constructor(
    client: SupabaseClient<Database, "grida_forms">,
    project_id: number,
    form_id?: string
  ) {
    this.client = client;
    this.project_id = project_id;
    this.form_id = form_id;
  }

  async createStoreConnection(store_id: number) {
    assert(this.form_id, "form_id is required");
    assert(store_id, "store_id is required");

    return await this.client
      .from("connection_commerce_store")
      .insert({
        form_id: this.form_id,
        project_id: this.project_id,
        store_id: store_id,
      })
      .select()
      .single();
  }
}
