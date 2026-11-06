import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ service_role: {} }));
vi.mock("@/services/x-supabase", () => ({}));

import { isResponseFieldStorageObjectPath } from "./storage";

const field_id = "11111111-1111-4111-8111-111111111111";
const response_id = "22222222-2222-4222-8222-222222222222";

describe("isResponseFieldStorageObjectPath", () => {
  it.each([
    `response/${response_id}/${field_id}/photo.png`,
    `response/42/${field_id}/photo.png`,
    `response/customer-42/${field_id}/scan (final)+v2,@$&=;:!'*_.png`,
  ])("accepts a field file at %s", (path) => {
    expect(isResponseFieldStorageObjectPath(path, field_id)).toBe(true);
  });

  it.each([
    ["another field", `response/${response_id}/other-field/photo.png`],
    ["a staged upload", `tmp/session/${field_id}/photo.png`],
    ["another root", `assets/${response_id}/${field_id}/photo.png`],
    ["the field folder", `response/${response_id}/${field_id}`],
    ["an empty name", `response/${response_id}/${field_id}/`],
    ["a nested name", `response/${response_id}/${field_id}/a/b.png`],
    ["a leading slash", `/response/${response_id}/${field_id}/photo.png`],
    ["an empty response id", `response//${field_id}/photo.png`],
    ["a dot response id", `response/./${field_id}/photo.png`],
    ["a parent response id", `response/../${field_id}/photo.png`],
    ["a dot name", `response/${response_id}/${field_id}/.`],
    ["a parent name", `response/${response_id}/${field_id}/..`],
    ["a dot with trailing spaces", `response/${response_id}/${field_id}/. `],
    [
      "a parent with trailing spaces",
      `response/${response_id}/${field_id}/.. `,
    ],
    ["a blank name", `response/${response_id}/${field_id}/   `],
    [
      "backslash traversal",
      `response/${response_id}/${field_id}/..\\..\\other-response\\other-field\\photo.png`,
    ],
    ["an encoded dot segment", `response/%2e%2e/${field_id}/photo.png`],
    ["an encoded slash", `response/${response_id}/${field_id}/a%2fb.png`],
    ["an encoded backslash", `response/${response_id}/${field_id}/a%5cb.png`],
    ["double encoding", `response/${response_id}/${field_id}/%252e%252e`],
    ["a null character", `response/${response_id}/${field_id}/a\0b.png`],
    ["a newline", `response/${response_id}/${field_id}/a\nb.png`],
    ["a tab", `response/${response_id}/${field_id}/a\tb.png`],
    ["a carriage return", `response/${response_id}/${field_id}/a\rb.png`],
    [
      "a parent with a trailing newline",
      `response/${response_id}/${field_id}/..\n`,
    ],
    [
      "a parent with a trailing return",
      `response/${response_id}/${field_id}/..\r`,
    ],
    ["a delete character", `response/${response_id}/${field_id}/a\u007fb.png`],
    [
      "a query delimiter",
      `response/${response_id}/${field_id}/a.png?download=1`,
    ],
    [
      "a fragment delimiter",
      `response/${response_id}/${field_id}/a.png#fragment`,
    ],
    ["an empty path", ""],
  ])("rejects %s", (_, path) => {
    expect(isResponseFieldStorageObjectPath(path, field_id)).toBe(false);
  });
});
