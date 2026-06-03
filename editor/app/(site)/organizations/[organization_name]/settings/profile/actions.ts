"use server";

// Reads + the org-row UPDATE use `createClient()` (user-authed, RLS-aware):
// the `organization` SELECT/UPDATE policies (`rls_organization`) only yield /
// accept a row for members, so they double as the authorization gate. The
// avatar object write goes through `service_role.workspace.storage` because the
// `avatars` bucket has no tracked storage RLS — the membership gate below is
// what authorizes it.

import { createClient, service_role } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // ~2MB
const AVATAR_ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

/**
 * Update an organization's general profile (display name, contact email,
 * description, blog) and, optionally, its avatar.
 *
 * Bound to the org name at the call site: `action={updateOrganizationProfile.bind(null, organization_name)}`.
 */
export async function updateOrganizationProfile(
  organization_name: string,
  formData: FormData
): Promise<void> {
  const client = await createClient();

  const { data: auth } = await client.auth.getUser();
  if (!auth.user) {
    throw new Error("unauthorized");
  }

  // `Enabled based on membership` RLS returns a row only to org members — this
  // select is both the id lookup and the authorization gate for the upload.
  const { data: org, error: orgError } = await client
    .from("organization")
    .select("id")
    .eq("name", organization_name)
    .single();

  if (orgError || !org) {
    throw new Error("organization not found or forbidden");
  }

  const display_name = formData.get("display_name");
  const email = formData.get("email");
  const description = formData.get("description");
  const blog = formData.get("blog");
  const remove_avatar = formData.get("remove_avatar") === "1";
  const avatar = formData.get("avatar");

  // `undefined` => leave avatar_path untouched. `null` => clear it.
  let avatar_path: string | null | undefined = undefined;

  if (remove_avatar) {
    avatar_path = null;
  } else if (avatar instanceof File && avatar.size > 0) {
    if (!AVATAR_ACCEPTED_TYPES.includes(avatar.type)) {
      throw new Error(`unsupported image type: ${avatar.type || "unknown"}`);
    }
    if (avatar.size > AVATAR_MAX_BYTES) {
      throw new Error("image too large (max 2MB)");
    }

    // Stable per-org key + upsert: replacing the avatar overwrites in place.
    const path = `org-${org.id}/avatar`;

    // service_role: the `avatars` bucket has no tracked storage RLS, so the
    // membership gate above is the authorization boundary for this write.
    const { error: uploadError } = await service_role.workspace.storage
      .from("avatars")
      .upload(path, avatar, {
        contentType: avatar.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("organization/profile avatar upload", uploadError);
      throw new Error("failed to upload avatar");
    }

    avatar_path = path;
  }

  // Mirrors the prior route's field handling (empty string => leave untouched).
  const { error: updateError } = await client
    .from("organization")
    .update({
      display_name: String(display_name),
      email: String(email),
      description: description ? String(description) : undefined,
      blog: blog ? String(blog) : undefined,
      ...(avatar_path !== undefined ? { avatar_path } : {}),
    })
    .eq("name", organization_name);

  if (updateError) {
    console.error("organization/profile update", updateError);
    throw new Error("failed to update organization");
  }

  revalidatePath(`/organizations/${organization_name}/settings/profile`);
}
