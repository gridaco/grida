import useSWR from "swr";
import type OpenAI from "openai";
import { listOpenAiModels } from "@/lib/ai/actions/models";

export function useModels() {
  return useSWR<{ data: OpenAI.Models.Model[] }>("ai/models/openai", () =>
    listOpenAiModels()
  );
}
