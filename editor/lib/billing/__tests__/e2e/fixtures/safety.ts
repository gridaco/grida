// Refuse to load unless we are demonstrably in a test environment:
//   - Stripe key is a test key (`sk_test_…`) — never run against live Stripe.
//   - Supabase URL is a local instance (localhost / 127.0.0.1) — never run
//     against a hosted project (staging or prod).
//   - NODE_ENV is not "production".
//   - The opt-in `BILLING_E2E=1` gate is set.
// Failing any check throws on call, which vitest reports as a test error.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function isLocalSupabaseUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

function isLocalAppUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    return LOCAL_HOSTS.has(new URL(raw).hostname);
  } catch {
    return false;
  }
}

export function assertSuiteSafety(): void {
  const issues: string[] = [];

  if (process.env.BILLING_E2E !== "1") {
    issues.push("BILLING_E2E must be set to '1'");
  }
  if (process.env.NODE_ENV === "production") {
    issues.push("NODE_ENV must not be 'production'");
  }

  // Stripe must be sandbox/test mode.
  const sk = process.env.STRIPE_SECRET_KEY ?? "";
  if (!sk.startsWith("sk_test_")) {
    issues.push(
      "STRIPE_SECRET_KEY must start with 'sk_test_' (refusing to run against live Stripe)"
    );
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    issues.push("STRIPE_WEBHOOK_SECRET is required");
  }

  // Supabase must be a local instance.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    issues.push("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is required");
  } else if (!isLocalSupabaseUrl(supabaseUrl)) {
    issues.push(
      `NEXT_PUBLIC_SUPABASE_URL must point at a local instance (got '${supabaseUrl}'). ` +
        `Hosted Supabase projects are forbidden — run \`supabase start\` and use the local URL.`
    );
  }
  if (!process.env.SUPABASE_SECRET_KEY) {
    issues.push("SUPABASE_SECRET_KEY is required (service-role)");
  }

  // App URL must also be local — the test signs and POSTs to APP_URL/private/webhooks/stripe.
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    issues.push("APP_URL is required (e.g. http://localhost:3000)");
  } else if (!isLocalAppUrl(appUrl)) {
    issues.push(
      `APP_URL must point at a local dev server (got '${appUrl}'). ` +
        `Refusing to deliver synthetic webhooks to a non-local host.`
    );
  }

  if (issues.length > 0) {
    throw new Error(
      `[billing-e2e] safety check failed:\n  - ${issues.join("\n  - ")}`
    );
  }
}
