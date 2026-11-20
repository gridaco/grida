import { desktopCompatibility } from "@/lib/desktop/compatibility";

const NO_STORE = { "cache-control": "no-store" } as const;

export function GET(): Response {
  return desktopCompatibility
    ? Response.json(desktopCompatibility, { headers: NO_STORE })
    : Response.json(
        { error: "desktop_compatibility_unavailable" },
        { status: 503, headers: NO_STORE }
      );
}
