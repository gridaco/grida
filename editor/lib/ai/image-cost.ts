// GRIDA-EE: billing — see ee-billing
/**
 * Image-generation cost math — the single mills computation shared by
 * every billed image surface (web server action + hosted
 * `/api/v1/ai/images/generations`). A billing-correctness surface: do
 * not fork per call site.
 */
import "server-only";

import ai from "@/lib/ai";

const QUALITY_TIERS = new Set(["high", "medium", "low"]);

/**
 * Pre-computed cost (integer mills) for an image-generation request
 * against a card's real pricing:
 *
 * - `per_image_flat` — flat USD × n.
 * - `per_image_tiered` — tier key `${quality}/${width}x${height}`
 *   (quality defaults to `medium`; `auto`/unknown values normalize to
 *   `medium`). Off-tier requests fall back to the card's
 *   `avg_cost_usd` — the documented pricing-anchor behavior for
 *   in-envelope but off-preset sizes.
 * - `per_token` — priced post-hoc by providers; billed at the card's
 *   average (the card's documented approximation).
 */
export function computeImageCostMills(
  card: ai.image.ImageModelCard,
  request: { n?: number; width?: number; height?: number; quality?: string }
): number {
  const n = Math.max(1, request.n ?? 1);
  switch (card.pricing.type) {
    case "per_image_flat":
      return ai.toMills(card.pricing.usd * n);
    case "per_image_tiered": {
      const { width, height } = request;
      const quality =
        request.quality && QUALITY_TIERS.has(request.quality)
          ? request.quality
          : "medium";
      const tierKey =
        width && height ? `${quality}/${width}x${height}` : undefined;
      const perImage =
        (tierKey && card.pricing.tiers[tierKey]) || card.avg_cost_usd;
      return ai.toMills(perImage * n);
    }
    case "per_token":
      return ai.toMills(card.avg_cost_usd * n);
  }
}
