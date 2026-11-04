// GRIDA-SEC-016 — response file previews stay inside the authorized field.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ service_role: {} }));
vi.mock("@/services/x-supabase", () => ({}));

import { isResponseFieldStorageObjectPath } from "./storage";

const field_id = "11111111-1111-4111-8111-111111111111";
const response_id = "22222222-2222-4222-8222-222222222222";

describe("isResponseFieldStorageObjectPath", () => {
  it("accepts the field's committed response files", () => {
    expect(
      isResponseFieldStorageObjectPath(
        `response/${response_id}/${field_id}/photo.png`,
        field_id
      )
    ).toBe(true);
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
    ["a parent response id", `response/../${field_id}/photo.png`],
    ["a dot name", `response/${response_id}/${field_id}/.`],
    ["a parent name", `response/${response_id}/${field_id}/..`],
    ["an empty path", ""],
  ])("rejects %s", (_, path) => {
    expect(isResponseFieldStorageObjectPath(path, field_id)).toBe(false);
  });
});
