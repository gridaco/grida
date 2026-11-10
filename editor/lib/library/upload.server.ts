import "server-only";

import { randomUUID } from "node:crypto";
import type { Database } from "@app/database";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LibraryCAS } from "./cas";
import { LibraryStorage } from "./storage";
import { LibraryTigris } from "./tigris.server";

/** The existing generated-image contribution flow, with replaceable object storage. */
export namespace LibraryUpload {
  type Client = SupabaseClient<Database, "grida_library">;
  type Object = Database["grida_library"]["Tables"]["object"]["Row"];

  async function existing(
    client: Client,
    sha256: string
  ): Promise<Object | null> {
    const { data, error } = await client
      .from("object")
      .select()
      .eq("sha256", sha256)
      .order("created_at")
      .order("id")
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  export async function generated(
    client: Client,
    file: { mediaType: string; uint8Array: Uint8Array },
    request: { model: string; prompt: string; width: number; height: number },
    tigris?: LibraryTigris
  ): Promise<{ object: Object; publicUrl: string }> {
    const { mediaType, uint8Array } = file;
    const sha256 = LibraryCAS.sha256Hex(uint8Array);
    const path = LibraryCAS.path(sha256, mediaType);
    let id: string;
    if (LibraryStorage.provider() === "tigris") {
      await (tigris ?? LibraryTigris.fromEnv()).upload(uint8Array, mediaType);
      id = randomUUID();
    } else {
      const { data: uploaded, error } = await client.storage
        .from("library")
        .upload(path, uint8Array, { contentType: mediaType });
      if (error && !LibraryCAS.isDuplicateError(error))
        throw new Error(error.message);
      if (uploaded?.id) {
        id = uploaded.id;
      } else {
        const { data: info, error: infoError } = await client.storage
          .from("library")
          .info(path);
        if (infoError || !info?.id)
          throw new Error(
            infoError?.message ?? "Library storage object is missing"
          );
        id = info.id;
      }
    }

    // Backfilled duplicates retain their UUIDs. Stable adoption does not edit
    // either historical record, and path uniqueness arbitrates new upload races.
    const prior = await existing(client, sha256);
    if (prior) return { object: prior, publicUrl: LibraryStorage.url(prior) };
    const { data: object, error } = await client
      .from("object")
      .insert({
        id,
        path,
        sha256,
        bytes: uint8Array.length,
        mimetype: mediaType,
        category: "generated",
        generator: request.model,
        prompt: request.prompt,
        width: request.width,
        height: request.height,
        transparency: false,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        const winner = await existing(client, sha256);
        if (winner)
          return { object: winner, publicUrl: LibraryStorage.url(winner) };
      }
      throw new Error(error.message);
    }
    return { object, publicUrl: LibraryStorage.url(object) };
  }
}
