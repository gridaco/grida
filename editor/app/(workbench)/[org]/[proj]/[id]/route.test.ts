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
  it("redirects a document path to its data tab", async () => {
    const res = await get("acme", "site", DOCUMENT_ID);
    expect(res.headers.get("location")).toBe(
      `https://grida.co/acme/site/${DOCUMENT_ID}/data`
    );
  });

  it("does not use a redirect status that browsers cache permanently", async () => {
    const res = await get("acme", "site", DOCUMENT_ID);
    expect(res.status).toBe(307);
  });

  it("accepts an uppercase document id, as postgres does", async () => {
    const id = DOCUMENT_ID.toUpperCase();
    const res = await get("acme", "site", id);
    expect(res.headers.get("location")).toBe(
      `https://grida.co/acme/site/${id}/data`
    );
  });

  it.each([
    ["a missing static asset", "templates", "slides", "index.json"],
    ["a standardized endpoint", ".well-known", "acme", "challenge"],
    ["an internal script path", "_vercel", "insights", "script.js"],
    ["a plain word", "acme", "site", "settings-old"],
    ["an id with trailing text", "acme", "site", `${DOCUMENT_ID}.json`],
  ])("answers 404 for %s without redirecting", async (_, org, proj, id) => {
    await expect(get(org, proj, id)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
