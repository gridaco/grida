import { workspace_service_client } from "@/supabase/server";
import { is_uuid_v4 } from "@/utils/is";

export async function upsert_customer_with({
  project_id,
  uuid,
  hints,
}: {
  project_id: number;
  uuid?: string | null;
  hints?: {
    email?: string;
    _fp_fingerprintjs_visitorid?: string;
  };
}) {
  const pl: {
    uuid?: string | null;
    project_id: number;
    email?: string;
    _fp_fingerprintjs_visitorid?: string;
    last_seen_at: string;
  } = {
    uuid: uuid,
    project_id: project_id,
    email: hints?.email,
    _fp_fingerprintjs_visitorid: hints?._fp_fingerprintjs_visitorid,
    last_seen_at: new Date().toISOString(),
  };

  try {
    if (uuid && is_uuid_v4(uuid)) {
      // if uuid is provided, we don't need to store fingerprint (vulnerable)
      delete pl._fp_fingerprintjs_visitorid;

      const { data: customer, error } = await workspace_service_client
        .from("customer")
        .upsert(pl, {
          onConflict: "project_id, uuid",
        })
        .select()
        .single();

      if (error) {
        console.error("customer::uuid_upsert_error:", error);
        throw error;
      }
      return customer;
    } else {
      const { data: customer, error } = await workspace_service_client
        .from("customer")
        .upsert(pl, {
          onConflict: "project_id, _fp_fingerprintjs_visitorid",
        })
        .select()
        .single();

      if (error) {
        console.error("customer::fingerprint_upsert_error:", error);
        throw error;
      }
      return customer;
    }
  } catch (e) {
    console.error("customer::unexpected_error:", e);
    throw e;
  }
}
