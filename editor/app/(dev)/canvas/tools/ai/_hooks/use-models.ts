import useSWR from "swr";
import type OpenAI from "openai";

export function useModels() {
  return useSWR<{ data: OpenAI.Models.Model[] }>(
    "/private/ai/models/openai",
    async () => {
      const res = await fetch("/private/ai/models/openai");
      if (!res.ok) {
        throw new Error("Failed to fetch models");
      }
      return res.json();
    }
  );
}
