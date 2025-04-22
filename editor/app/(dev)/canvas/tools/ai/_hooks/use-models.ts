import useSWR from "swr";
import type OpenAI from "openai";

export function useModels() {
  return useSWR<{ data: OpenAI.Models.Model[] }>(
    "/private/ai/models",
    async () => {
      const res = await fetch("/private/ai/models");
      if (!res.ok) {
        throw new Error("Failed to fetch models");
      }
      return res.json();
    }
  );
}
