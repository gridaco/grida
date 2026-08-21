import type { aiModelPages } from "@/www/data/ai-model-pages";
import { GptImage2Page } from "./gpt-image-2-page";

/**
 * Deliberately explicit: every indexed model earns an authored page instead of
 * being poured into one cross-modality template.
 */
export function ModelPage({ page }: { page: aiModelPages.Entry }) {
  switch (page.slug) {
    case "gpt-image-2":
      return <GptImage2Page page={page} />;
    default:
      throw new Error(`No authored AI model page for: ${page.slug}`);
  }
}
