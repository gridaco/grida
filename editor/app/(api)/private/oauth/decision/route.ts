/** GRIDA-SEC-010 — same-origin, browser-bound consent submission. */
import { oauthConsent } from "@/lib/auth/oauth-consent";
import { oauthServer } from "@/lib/auth/oauth-server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const service = new oauthConsent.Service(oauthServer.consentConfig());
    oauthConsent.requireOrigin(request, service.config);
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user)
      throw new oauthServer.Failure(
        error &&
          error.status !== 401 &&
          error.status !== 403 &&
          error.name !== "AuthSessionMissingError"
          ? "auth_unavailable"
          : "unauthorized"
      );
    const {
      data: { session },
    } = await client.auth.getSession();
    if (!session || session.user.id !== user.id)
      throw new oauthServer.Failure("unauthorized");
    const url = await service.decide(request, {
      id: user.id,
      access_token: session.access_token,
    });
    return new Response(null, {
      status: 303,
      headers: { ...oauthServer.responseHeaders, location: url },
    });
  } catch (error) {
    return oauthServer.errorResponse(error);
  }
}
