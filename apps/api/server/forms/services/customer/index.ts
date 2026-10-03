import { service_role } from "../../db";
import { is_uuid_v4 } from "@grida/forms";

export async function upsert_customer_with({
  project_id,
  uuid,
  hints,
}: {
  project_id: number;
  uuid?: string | null;
  hints?: {
    _fp_fingerprintjs_visitorid?: string;
    email?: string;
    phone?: string;
    name?: string;
  };
}) {
  const pl: {
    uuid?: string | null;
    project_id: number;
    _fp_fingerprintjs_visitorid?: string;
    email?: string;
    phone?: string;
    name?: string;
    last_seen_at: string;
  } = {
    uuid: uuid,
    project_id: project_id,
    email: hints?.email,
    phone: hints?.phone,
    name: hints?.name,
    _fp_fingerprintjs_visitorid: hints?._fp_fingerprintjs_visitorid,
    last_seen_at: new Date().toISOString(),
  };

  if (uuid && is_uuid_v4(uuid)) {
    // if uuid is provided, we don't need to store fingerprint (vulnerable)
    delete pl._fp_fingerprintjs_visitorid;

    const { data: customer, error } = await service_role.workspace
      .from("customer")
      .upsert(pl, {
        onConflict: "project_id, uuid",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return customer;
  } else {
    // FIXME: we should not be relying on fingerprint for customer identification
    // this should be replaced with 100% user-configured policy
    // there is no universal way to idintify a customer (without explicit uuid)
    const { data: customer, error } = await service_role.workspace
      .from("customer")
      .upsert(pl, {
        onConflict: "project_id, _fp_fingerprintjs_visitorid",
      })
      .select()
      .single();

    if (error) {
      throw error;
    }
    return customer;
  }
}
