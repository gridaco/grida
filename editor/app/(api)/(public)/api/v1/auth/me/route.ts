/** GRIDA-SEC-010 — live, registered OAuth bearer authority only. */
import { bearer } from "@/lib/auth/bearer";
import { oauthServer } from "@/lib/auth/oauth-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** First-party OAuth account identity. Never falls back to browser cookies. */
export async function GET(request: Request) {
  try {
    const { identity } = await bearer.authenticate(request);
    return Response.json(identity, { headers: oauthServer.responseHeaders });
  } catch (error) {
    return oauthServer.errorResponse(error);
  }
}
