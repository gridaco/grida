import type { TGridaG11nSupabaseClient } from "@/supabase/types";
import { PGINT8ID } from "@/types";

///
/// WIP
///

class GridaG11nService {
  constructor(readonly client: TGridaG11nSupabaseClient) {}

  async createManifest(project_id: PGINT8ID) {
    const { data, error } = await this.client
      .from("manifest")
      .insert({
        project_id: project_id,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return new GridaG11nManifestService(this.client, data.id);
  }
}

class GridaG11nManifestService {
  //
  constructor(
    readonly client: TGridaG11nSupabaseClient,
    readonly manifest_id: PGINT8ID
  ) {}

  async upsertLocale() {
    //
  }
}
