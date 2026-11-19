import { readDesktopCompatibilityPolicy } from "@/lib/desktop/compatibility-policy";

const NO_STORE = { "cache-control": "no-store" } as const;

export function GET(): Response {
  const policy = readDesktopCompatibilityPolicy();
  return policy
    ? Response.json(policy, { headers: NO_STORE })
    : Response.json(
        { error: "desktop_compatibility_unavailable" },
        { status: 503, headers: NO_STORE }
      );
}
