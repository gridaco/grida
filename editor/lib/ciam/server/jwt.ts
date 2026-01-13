import { SignJWT, importJWK } from "jose";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "http://127.0.0.1:54321";

type SigningKeyJwk = {
  kty: string;
  kid?: string;
  alg?: string;
  use?: string;
  key_ops?: string[];
  crv?: string;
  x?: string;
  y?: string;
  d?: string; // present only in private JWK
  [k: string]: unknown;
};

function load_jwt_signing_key(): SigningKeyJwk {
  // `SUPABASE_SIGNING_KEY_JSON` must be a **private** JWK (must include `d`).
  // Note: Supabase JWKS (`/auth/v1/.well-known/jwks.json`) is public-only and cannot be used for signing.
  const envJwk = process.env.SUPABASE_SIGNING_KEY_JSON;

  if (!envJwk) {
    throw new Error(
      "SUPABASE_SIGNING_KEY_JSON is required (private JWK, must include `d`)."
    );
  }

  const jwk = JSON.parse(envJwk) as SigningKeyJwk;

  if (!jwk?.d) {
    throw new Error(
      "SUPABASE_SIGNING_KEY_JSON does not include private key material (missing `d`). " +
        "Provide the private JWK JSON (e.g. from your generated signing key)."
    );
  }

  return jwk;
}

/**
 * Signs a customer session JWT token using the same signing keys as Supabase Auth
 *
 * Uses ES256 algorithm with keys from signing_keys.json, so PostgREST accepts the JWT seamlessly
 *
 * @param sessionId - The customer session ID from grida_ciam.customer_session
 * @param expiresAt - Session expiration timestamp
 * @returns Signed JWT token string
 */
export async function signCustomerSessionToken(
  sessionId: string,
  expiresAt: Date
): Promise<string> {
  const signingJwk = load_jwt_signing_key();

  // jose doesn't need/like these for importing to a sign-capable CryptoKey in Node/WebCrypto
  const keyWithoutMetadata = { ...signingJwk } as SigningKeyJwk;
  delete keyWithoutMetadata.use;
  delete keyWithoutMetadata.key_ops;
  const privateKey = await importJWK(keyWithoutMetadata, "ES256");

  const jwt = await new SignJWT({
    sid: sessionId,
    role: "authenticated", // Required for Supabase to assign authenticated role
  })
    .setProtectedHeader({ alg: "ES256", kid: signingJwk.kid })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setSubject(sessionId)
    // IMPORTANT:
    // We intentionally set `iss` to the Supabase project Auth issuer so hosted PostgREST accepts the JWT.
    // Local PostgREST may appear to accept arbitrary `iss`, but hosted Supabase can enforce issuer validation.
    //
    // TODO(grida_ciam): consider migrating to a true third-party / OIDC issuer setup for CIAM JWTs
    // (CIAM as its own issuer + JWKS discovery). This adds non-trivial operational complexity,
    // especially if we want issuer scoping per-tenant (per project).
    .setIssuer(`${SUPABASE_URL}/auth/v1`)
    .setAudience("authenticated")
    .sign(privateKey);

  return jwt;
}
