/** GRIDA-SEC-010 — browser consent; native credentials never enter this page. */
import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { oauthConsent } from "@/lib/auth/oauth-consent";
import { oauthServer } from "@/lib/auth/oauth-server";
import { ContinueWithGoogleButton } from "@/host/auth/continue-with-google-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Authorize Grida CLI",
  // no-referrer can make navigation POST Origin null. Origin-only referrers
  // preserve the exact same-origin check without exposing authorization IDs.
  referrer: "strict-origin",
  robots: { index: false, follow: false },
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string | string[] }>;
}) {
  let view:
    | oauthConsent.View
    | { kind: "sign-in"; id: string; insidersPath: string }
    | { kind: "error"; message: string };
  try {
    const id = oauthConsent.authorizationId(
      (await searchParams).authorization_id
    );
    const service = new oauthConsent.Service(oauthServer.consentConfig());
    oauthConsent.requireHost(await headers(), service.config);
    const client = await createClient();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (
      error &&
      error.status !== 401 &&
      error.status !== 403 &&
      error.name !== "AuthSessionMissingError"
    ) {
      throw new oauthServer.Failure("auth_unavailable");
    }
    if (error || !user) {
      view = {
        kind: "sign-in",
        id,
        insidersPath: oauthConsent.insidersPath(id, service.config),
      };
    } else {
      const {
        data: { session },
      } = await client.auth.getSession();
      if (!session || session.user.id !== user.id)
        throw new oauthServer.Failure("unauthorized");
      view = await service.load(id, {
        id: user.id,
        access_token: session.access_token,
      });
    }
  } catch (error) {
    view = { kind: "error", message: oauthServer.failure(error).message };
  }
  // Next redirect() throws: it must remain outside the failure handler.
  if (view.kind === "redirect") redirect(view.url);
  if (
    view.kind === "sign-in" &&
    process.env.NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH === "1"
  ) {
    redirect(view.insidersPath);
  }
  return (
    <main
      data-testid="oauth-consent"
      className="flex min-h-svh items-center justify-center bg-background px-6 py-12 text-foreground"
    >
      <section className="w-full max-w-md space-y-6 rounded-xl border p-8 shadow-sm">
        <p className="text-sm font-semibold">Grida</p>
        {view.kind === "error" ? (
          <>
            <h1 className="text-2xl font-semibold">Unable to authorize</h1>
            <p role="alert">{view.message}</p>
          </>
        ) : view.kind === "sign-in" ? (
          <>
            <h1 className="text-2xl font-semibold">Sign in to continue</h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your Grida account to review this application’s access.
            </p>
            <ContinueWithGoogleButton next={oauthConsent.path(view.id)} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">
              Authorize {view.client_name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Signed in as {view.email ?? "your Grida account"}.
            </p>
            <p>
              Allow this application to access your Grida account using your
              existing permissions.
            </p>
            <p className="text-sm text-muted-foreground">
              It also requests your{" "}
              {view.scopes
                .map((scope) =>
                  scope === "email" ? "email address" : "profile information"
                )
                .join(" and ")}
              .
            </p>
            <form
              action="/private/oauth/decision"
              method="post"
              className="flex gap-3"
            >
              <input
                type="hidden"
                name="authorization_id"
                value={view.authorization_id}
              />
              <input type="hidden" name="proof" value={view.proof} />
              <button
                className="flex-1 rounded-md border px-4 py-2"
                name="decision"
                value="deny"
              >
                Deny
              </button>
              <button
                className="flex-1 rounded-md bg-primary px-4 py-2 text-primary-foreground"
                name="decision"
                value="approve"
              >
                Allow
              </button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
