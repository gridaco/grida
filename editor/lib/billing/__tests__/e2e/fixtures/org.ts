import { randomUUID } from "node:crypto";
import { service_role } from "@/lib/supabase/server";
import { getCustomerId, stripe } from "../../..";
import { deliverEvent } from "./deliver-event";

export interface EphemeralOrg {
  org_id: number;
  name: string;
  owner_user_id: string;
}

const SEED_OWNER_EMAIL = "insider@grida.co";

// `organization.owner_id` FKs to `auth.users.id`, so we can't mint a random
// uuid. Use the seed user — its uuid is regenerated on every `db reset`,
// so look it up at runtime. Sharing one owner across ephemeral orgs is fine
// (the FK is not unique).
async function getSeedOwnerId(): Promise<string> {
  const { data, error } = await service_role.workspace.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) throw new Error(`getSeedOwnerId: ${error.message}`);
  const user = data.users.find((u) => u.email === SEED_OWNER_EMAIL);
  if (!user) {
    throw new Error(
      `getSeedOwnerId: seed user ${SEED_OWNER_EMAIL} not found. Run \`supabase db reset\` to re-seed.`
    );
  }
  return user.id;
}

export async function provisionEphemeralOrg(): Promise<EphemeralOrg> {
  const slug = `e2e-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const owner_user_id = await getSeedOwnerId();

  const { data, error } = await service_role.workspace
    .from("organization")
    .insert({
      name: slug,
      display_name: `E2E ${slug}`,
      owner_id: owner_user_id,
    })
    .select("id")
    .single();

  if (error) throw new Error(`provisionEphemeralOrg: ${error.message}`);
  if (!data?.id) throw new Error("provisionEphemeralOrg: no id returned");
  return { org_id: data.id as number, name: slug, owner_user_id };
}

// The org-delete guard refuses while a Stripe-backed subscription is active,
// so we drive the cancellation through the projector ourselves: cancel at
// Stripe, deliver `customer.subscription.deleted` to flip the local row to
// `canceled`. We can't rely on Stripe's own webhook — `stripe listen` isn't
// running in the test process. Then delete the customer and the org row;
// CASCADE wipes `grida_billing.*`.
export async function teardownOrg(org: EphemeralOrg): Promise<void> {
  const customerId = await getCustomerId(org.org_id);

  if (customerId) {
    try {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of subs.data) {
        if (sub.status === "canceled") continue;
        const canceled = await stripe.subscriptions
          .cancel(sub.id)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (/No such subscription|resource_missing/i.test(msg)) return null;
            throw err;
          });
        if (canceled) {
          await deliverEvent("customer.subscription.deleted", canceled);
        }
      }
    } catch (err) {
      // Surface the failure: a swallowed cancel leaves orphaned Stripe state
      // that pollutes the test sandbox over time. Only "already gone" errors
      // are tolerated and they're handled inside the inner cancel catch above.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[e2e/org] subscription cleanup failed: ${msg}`);
    }

    try {
      await stripe.customers.del(customerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "Already deleted" is fine; everything else is a real teardown failure
      // and must not be silently logged — orphan customers compound across
      // runs and eventually trip the test sandbox limits.
      if (/No such customer|resource_missing/i.test(msg)) return;
      throw new Error(`[e2e/org] customer delete failed: ${msg}`);
    }
  }

  const del = await service_role.workspace
    .from("organization")
    .delete()
    .eq("id", org.org_id);
  if (del.error) {
    throw new Error(`teardownOrg(${org.org_id}): ${del.error.message}`);
  }
}
