/** Fixed local external-provider simulator; never an arbitrary upstream override. */
export function fixtureGateway(
  env: Record<string, string | undefined>
): { baseURL: string; apiKey: string } | null {
  const origin = env.GRIDA_PLATFORM_AI_FIXTURE_ORIGIN;
  if (origin === undefined) return null;
  if (
    origin !== "http://127.0.0.1:56746" ||
    env.GRIDA_PLATFORM_ALLOW_LOCAL !== "1" ||
    env.NODE_ENV === "production" ||
    env.GG_VERCEL_AI_GATEWAY_API_KEY !== "grida-local-ai-fixture" ||
    env.BYOK_OPENROUTER_API_KEY ||
    env.BYOK_VERCEL_AI_GATEWAY_API_KEY
  )
    throw new Error("invalid local AI fixture configuration");
  return { baseURL: `${origin}/v3/ai`, apiKey: "grida-local-ai-fixture" };
}
