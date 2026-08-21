"use server";

// Everything here runs through `createClient()` (user-authed, RLS-aware) — the
// org row read/update AND the avatar object read/write/delete. Authorization is
// enforced by RLS end to end: the `organization` SELECT/UPDATE policies
// (`rls_organization`) and the `avatars` bucket storage policies (added in
// migration `*_avatars_bucket_rls.sql`, scoped to org membership via the
// `{organization_id}/avatar` path). No service_role anywhere. The org select
// below is a lightweight gate kept only for a friendly error — RLS is the real
// boundary.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // ~2MB

/**
 * Sniff the real image type from the file's leading bytes instead of trusting
 * the client-supplied `File.type` (which is attacker-controlled). Returns the
 * canonical MIME for png/jpeg/webp, or `null` when the magic bytes match none
 * of the accepted formats.
 */
function sniffImageType(bytes: Uint8Array): string | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // WEBP: "RIFF" .... "WEBP" (RIFF container with a WEBP fourCC at offset 8)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }

  return null;
}

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

  const display_name_raw = formData.get("display_name");
  const email_raw = formData.get("email");
  const description = formData.get("description");
  const blog = formData.get("blog");
  const remove_avatar = formData.get("remove_avatar") === "1";
  const avatar = formData.get("avatar");

  // `display_name` and `email` are required. Validate presence explicitly —
  // `String(null)` would otherwise persist the literal string "null".
  const display_name =
    typeof display_name_raw === "string" ? display_name_raw.trim() : "";
  if (!display_name) {
    throw new Error("display name is required");
  }
  const email = typeof email_raw === "string" ? email_raw.trim() : "";
  if (!email) {
    throw new Error("email is required");
  }

  // Object path scheme: `{organization_id}/avatar`. The leading folder segment
  // is what the storage RLS policy parses to authorize the write.
  const path = `${org.id}/avatar`;

  // `undefined` => leave avatar_path untouched. `null` => clear it.
  let avatar_path: string | null | undefined = undefined;

  if (remove_avatar) {
    // Best-effort object delete (RLS-guarded by the same membership policy);
    // the row going null is what drives display, so a missing object is fine.
    const { error: removeError } = await client.storage
      .from("avatars")
      .remove([path]);
    if (removeError) {
      console.error("organization/profile avatar remove", removeError);
    }
    avatar_path = null;
  } else if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > AVATAR_MAX_BYTES) {
      throw new Error("image too large (max 2MB)");
    }

    // Don't trust the client-reported `avatar.type` — sniff the real format
    // from the leading bytes and reject anything that isn't png/jpeg/webp.
    const buffer = await avatar.arrayBuffer();
    const sniffed = sniffImageType(new Uint8Array(buffer));
    if (!sniffed) {
      throw new Error(`unsupported image type: ${avatar.type || "unknown"}`);
    }

    // User-authed upload — the `avatars` bucket storage policy authorizes it by
    // org membership (parsed from the path). Stable key + upsert overwrites in
    // place on replace. Upload the already-read buffer with the sniffed type as
    // the authoritative contentType.
    const { error: uploadError } = await client.storage
      .from("avatars")
      .upload(path, buffer, {
        contentType: sniffed,
        upsert: true,
      });

    if (uploadError) {
      console.error("organization/profile avatar upload", uploadError);
      throw new Error("failed to upload avatar");
    }

    avatar_path = path;
  }

  // `display_name`/`email` are validated non-empty above. Optional fields:
  // empty/absent => leave untouched (undefined is omitted from the update).
  const { error: updateError } = await client
    .from("organization")
    .update({
      display_name,
      email,
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
