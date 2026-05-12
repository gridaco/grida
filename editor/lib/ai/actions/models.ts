"use server";

/**
 * AI provider model lookups — pure SDK proxies. Used by editor UIs that
 * need to pick a provider model id (e.g. canvas tool model picker).
 *
 * The OpenAI client lives inside `lib/ai/server.ts` per GRIDA-SEC-003
 * (every AI provider SDK import goes through that single seam).
 */

import type OpenAI from "openai";
import { methods } from "@/lib/ai/server";

export async function listOpenAiModels(): Promise<{
  data: OpenAI.Models.Model[];
}> {
  return methods.listOpenAiModels();
}
