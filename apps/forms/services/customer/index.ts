import { workspaceclient } from "@/lib/supabase/server";
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

  if (uuid && is_uuid_v4(uuid)) {
    const { data: customer, error } = await workspaceclient
      .from("customer")
      .upsert(pl, {
        onConflict: "project_id, uuid",
      })
      .select()
      .single();

    if (error) {
      delete pl._fp_fingerprintjs_visitorid;
      const { data: customer, error } = await workspaceclient
        .from("customer")
        .upsert(pl, {
          onConflict: "project_id, uuid",
        })
        .select()
        .single();

      if (error) {
        console.error("customer::error-2:", error);
        throw error;
      }
      return customer;
    }

    return customer;
  } else {
    const { data: customer, error } = await workspaceclient
      .from("customer")
      .upsert(pl)
      .select()
      .single();

    error && console.error("customer::error-1:", error);
    // console.log("customer::upserted:", customer);
    return customer;
  }
}
