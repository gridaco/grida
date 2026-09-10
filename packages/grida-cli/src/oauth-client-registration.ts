// GRIDA-SEC-010 — shipped CLI identity and account destination authority.
import type { AuthClient } from "@grida/auth";

/**
 * Grida CLI's public native OAuth registration, shared by every installation.
 * Intentionally versioned in Git and bundled into the executable: these values
 * are public metadata, not secrets or proof that a binary is trustworthy.
 *
 * Keep application registration here, outside the registration-agnostic auth SDK.
 * Changes must stay aligned with Supabase's OAuth app and Grida's server allowlist;
 * issuer/client/API changes also affect durable credential profile identity.
 * The publishable key admits the fixed issuer's logout request; it is not an
 * OAuth client secret or user authority. Key rotation does not select a new
 * account profile. Keep it aligned with the same project's public web key.
 * Do not add client secrets, user credentials or environment lookup here.
 */
export const oauthClientRegistration: AuthClient.Config = Object.freeze({
  clientId: "ab2b3b01-a0a1-4d40-969c-b8fc177a2557",
  publishableKey: "sb_publishable_dRc62vMF3jbqm2UD8cTGig_blvDStbc",
  issuer: "https://mozagqllybnbytfcmvdh.supabase.co/auth/v1",
  apiOrigin: "https://grida.co",
  redirectUris: Object.freeze([
    "http://127.0.0.1:55435/callback",
    "http://127.0.0.1:55436/callback",
  ]),
});
