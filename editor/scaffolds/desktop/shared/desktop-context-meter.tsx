/**
 * The earlier chat's context meter: resolves the selected TypeScript-agent
 * model's window, then draws the shared `ContextMeter`. Only the earlier
 * workspace pane and file-window chat render it, which only installed Desktop
 * builds without native chat reach. Remove it with those panes.
 */

"use client";

import { useGGModels } from "@/lib/desktop/gg-models";
import { useMemo } from "react";
import type { UIMessage } from "ai";
import type { EndpointProviderConfig } from "@/lib/desktop/bridge";
import { computeContextUsage } from "@/lib/agent-chat/context-usage";
import { registered_models } from "./registered-models";
import { ContextMeter } from "./context-meter";

export function DesktopContextMeter({
  messages,
  modelId,
  providerId,
  costUsd,
  endpoints = [],
}: {
  messages: UIMessage[];
  /** Active model id — its resolved spec supplies the context window. */
  modelId: string;
  /** Exact provider paired with `modelId`, when selected or persisted. */
  providerId?: string;
  /** Session cumulative base-rate estimate from aggregate per-turn usage.
   * Request-level pricing bands are not reconstructible from this rollup. */
  costUsd?: number;
  /** Configured endpoint providers (issue #806) — registered local models
   *  resolve their real (often small) windows through these. */
  endpoints?: readonly EndpointProviderConfig[];
}) {
  // Memoized: chat panels re-render per streamed token, and resolve()
  // rebuilds the flattened spec list each call.
  const ggModels = useGGModels();
  const contextWindow = useMemo(
    () =>
      registered_models.resolve(modelId, endpoints, providerId, ggModels)
        ?.contextWindow,
    [modelId, providerId, endpoints, ggModels]
  );
  const usage = useMemo(
    () => computeContextUsage(messages, contextWindow),
    [messages, contextWindow]
  );
  return <ContextMeter usage={usage} costUsd={costUsd} />;
}
