/**
 * `@grida/agent/sandbox` — package-owned sandbox policy intent.
 *
 * Un-bundled from `./server` (where it used to be re-exported) so a host
 * can compute its OS-sandbox wrap without importing the whole AgentHost
 * server entry. The host adapts this intent to its sandbox runtime
 * (macOS Seatbelt, etc.); see docs/sandbox-policy.md.
 *
 * Residual (deferred follow-up): `ALWAYS_ALLOWED_HOSTS` in `./policy`
 * still hardcodes model-provider hosts (openrouter.ai, ai-gateway.vercel.sh,
 * *.vercel-ai.com). Decoupling that — the host passing its own provider
 * hosts in — is the clean finish of provider extraction (the resolution
 * layer is BYOK-only in `../providers`); tracked as a separate task.
 */

export {
  buildAgentHostSandboxPolicy,
  hostFromUrl,
  type AgentHostSandboxPolicy,
} from "./policy";
