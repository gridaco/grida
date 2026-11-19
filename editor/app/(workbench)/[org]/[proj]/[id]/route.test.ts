import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const DOCUMENT_ID = "3f2b8c1e-7a4d-4e9b-8c21-5d6f7a8b9c0d";

function get(org: string, proj: string, id: string) {
  return GET(new NextRequest(`https://grida.co/${org}/${proj}/${id}`), {
    params: Promise.resolve({ org, proj, id }),
  });
}

describe("GET /[org]/[proj]/[id]", () => {
  it.each([
    ["a canonical UUID", DOCUMENT_ID],
    ["an uppercase UUID", DOCUMENT_ID.toUpperCase()],
    ["a compact UUID", DOCUMENT_ID.replaceAll("-", "")],
    ["a brace-wrapped UUID", `{${DOCUMENT_ID}}`],
    ["a UUID with alternate hyphens", "3f2b-8c1e-7a4d4e9b-8c215d6f-7a8b9c0d"],
  ])("temporarily redirects a document path with %s", async (_, id) => {
    const res = await get("acme", "site", id);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      `https://grida.co/acme/site/${encodeURIComponent(id)}/data`
    );
  });

  it.each([
    ["a missing static asset", "templates", "slides", "index.json"],
    ["a UUID under .well-known", ".well-known", "acme-challenge", DOCUMENT_ID],
    ["a UUID under _vercel", "_vercel", "insights", DOCUMENT_ID],
    ["a plain word", "acme", "site", "settings-old"],
    ["an id with trailing text", "acme", "site", `${DOCUMENT_ID}.json`],
    ["an id with an unmatched brace", "acme", "site", `{${DOCUMENT_ID}`],
    [
      "an id with a misplaced hyphen",
      "acme",
      "site",
      "3f-2b8c1e-7a4d-4e9b-8c21-5d6f7a8b9c0d",
    ],
  ])("answers 404 for %s without redirecting", async (_, org, proj, id) => {
    await expect(get(org, proj, id)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
