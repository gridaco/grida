// GRIDA-SEC-004 / GRIDA-SEC-006 — trusted provider implementations, not the safe operation API.
// GRIDA-GG: token — shared adapters never own account credentials or persistence.
export {
  catalogView,
  catalogViewOnMiss,
  CATALOG_PATH,
  type RefreshReason,
} from "./model-catalog";
export { liveGgMediaDeps } from "./gg-session";
export {
  GridaGatewayAuthError,
  GridaGatewayCreditsError,
  readGgToken,
  throwOnGgHttpError,
  gridaGatewayApiBase,
  postHosted,
  joinApi,
} from "./gg";
export {
  assertAllowedUrl,
  safeText,
  falQueueOutcome,
  pollQueue,
  type PollOutcome,
} from "./fetch-helpers";
export {
  BYOK_PROVIDER_METADATA,
  BYOK_PROVIDER_IDS,
  byokProvidersFor,
  isByokProviderId,
  GG_PROVIDER_ID,
  GG_PROVIDER_METADATA,
  isGgProviderId,
  type ByokProviderId,
  type ByokProviderMetadata,
  type ByokModality,
} from "./provider-ids";
