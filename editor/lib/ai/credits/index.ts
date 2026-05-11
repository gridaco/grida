/**
 * Public client surface of the AI credits module.
 *
 *   import { AiCredits, useAiCredits } from "@/lib/ai/credits";
 *
 * Server consumers (route-group `layout.tsx`, server `page.tsx`) import
 * directly from `./actions` — the path makes the server boundary
 * visible:
 *
 *   import { preloadAiCredits } from "@/lib/ai/credits/actions";
 *
 * See `./README.md` for the full contract.
 */

import * as format from "./format";
import { Provider } from "./provider";

export { useAiCredits } from "./provider";
export {
  AiCreditsController,
  type AiCreditsState,
  type AiCreditsDeps,
  type ConsumeOptions,
} from "./controller";

/**
 * Namespace for the React component (`Provider`) and pure helpers
 * (`format`). Hook lives at top-level as `useAiCredits` for
 * `rules-of-hooks` lint detection and grep-ability.
 */
export const AiCredits = {
  Provider,
  format,
};
