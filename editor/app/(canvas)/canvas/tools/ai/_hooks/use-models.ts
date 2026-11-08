import useSWR from "swr";
import { listHostedTextModels } from "@/lib/ai/actions/models";

export function useModels() {
  return useSWR("ai/models/gg/text", listHostedTextModels, {
    revalidateOnFocus: true,
  });
}
