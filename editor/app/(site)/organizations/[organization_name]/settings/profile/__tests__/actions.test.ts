/**
 * Unit tests for `updateOrganizationProfile` — the org General settings server
 * action. The supabase client and `next/cache` are mocked; these assert the
 * pure decision logic: the membership gate, avatar validation, the
 * `{id}/avatar` path scheme + upsert upload, and the remove flow.
 *
 * Note: the upload/remove go through the SAME user-authed `createClient()` as
 * the row read/update — there is no `service_role` in this feature (RLS is the
 * boundary), so the mock exposes only `createClient`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Typed `vi.fn` shorthand (repo lint requires explicit mock type parameters).
const fn = () => vi.fn<(...args: never[]) => unknown>();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn<(...args: never[]) => void>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn<(...args: never[]) => unknown>(),
}));

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { updateOrganizationProfile } from "../actions";

const mockedCreateClient = vi.mocked(createClient);

const ORG_NAME = "acme";
const ORG_ID = 42;

/**
 * Build a user-authed client stub. `.from("organization")` drives the
 * membership gate + profile update; `.storage.from("avatars")` captures the
 * upload/remove calls.
 */
function makeUserClient(opts: { member?: boolean } = {}) {
  const member = opts.member ?? true;
  const update = fn().mockReturnValue({
    eq: fn().mockResolvedValue({ error: null }),
  });
  const upload = fn().mockResolvedValue({ error: null });
  const remove = fn().mockResolvedValue({ error: null });
  const storageFrom = vi
    .fn<(bucket: string) => unknown>()
    .mockReturnValue({ upload, remove });

  const client = {
    auth: {
      getUser: fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: vi.fn<(table: string) => unknown>((table: string) => {
      if (table !== "organization")
        throw new Error(`unexpected table ${table}`);
      return {
        select: fn().mockReturnValue({
          eq: fn().mockReturnValue({
            single: fn().mockResolvedValue(
              member
                ? { data: { id: ORG_ID }, error: null }
                : { data: null, error: { message: "forbidden" } }
            ),
          }),
        }),
        update,
      };
    }),
    storage: { from: storageFrom },
  };
  return { client, update, upload, remove, storageFrom };
}

function form(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v as never);
  return fd;
}

// Leading magic bytes the server action sniffs (it ignores `File.type`).
const MAGIC: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff],
  // "RIFF" + 4 size bytes + "WEBP"
  webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  // "GIF8" — a real format, but NOT one of the accepted types.
  gif: [0x47, 0x49, 0x46, 0x38],
};

/**
 * Build an image `File`. `magic` controls the real leading bytes (what the
 * action sniffs); `type` is the client-declared MIME (which the action must
 * NOT trust). Omit `magic` for a buffer of zero bytes (no valid signature).
 */
function imageFile(
  type: string,
  bytes: number,
  name = "a.png",
  magic?: number[]
) {
  const buf = new Uint8Array(bytes);
  if (magic) buf.set(magic.slice(0, bytes), 0);
  return new File([buf], name, { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateOrganizationProfile", () => {
  it("rejects when the caller is not an org member (RLS gate)", async () => {
    const { client } = makeUserClient({ member: false });
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      updateOrganizationProfile(
        ORG_NAME,
        form({ display_name: "Acme", email: "a@acme.com" })
      )
    ).rejects.toThrow(/not found or forbidden/);
  });

  it("updates text fields without touching avatar_path when no file/remove", async () => {
    const { client, update, upload, remove } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await updateOrganizationProfile(
      ORG_NAME,
      form({
        display_name: "Acme Inc",
        email: "a@acme.com",
        description: "hello",
        blog: "https://acme.com",
      })
    );

    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    const payload = update.mock.calls[0][0];
    expect(payload).toMatchObject({
      display_name: "Acme Inc",
      email: "a@acme.com",
      description: "hello",
      blog: "https://acme.com",
    });
    expect("avatar_path" in payload).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith(
      `/organizations/${ORG_NAME}/settings/profile`
    );
  });

  it("uploads via the user-auth client to {id}/avatar (upsert) and writes avatar_path", async () => {
    const { client, update, upload, storageFrom } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await updateOrganizationProfile(
      ORG_NAME,
      form({
        display_name: "Acme",
        email: "a@acme.com",
        avatar: imageFile("image/png", 1024, "a.png", MAGIC.png),
      })
    );

    // Goes through the user-authed client's storage, not service_role.
    expect(storageFrom).toHaveBeenCalledWith("avatars");
    const [path, , options] = upload.mock.calls[0];
    expect(path).toBe(`${ORG_ID}/avatar`);
    expect(options).toMatchObject({ upsert: true, contentType: "image/png" });
    expect(update.mock.calls[0][0]).toMatchObject({
      avatar_path: `${ORG_ID}/avatar`,
    });
  });

  it("uses the sniffed type as contentType, ignoring a spoofed File.type", async () => {
    const { client, upload } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    // Declared as PNG, but the real bytes are JPEG — sniffed type wins.
    await updateOrganizationProfile(
      ORG_NAME,
      form({
        display_name: "Acme",
        email: "a@acme.com",
        avatar: imageFile("image/png", 1024, "a.png", MAGIC.jpeg),
      })
    );

    const [, , options] = upload.mock.calls[0];
    expect(options).toMatchObject({ contentType: "image/jpeg" });
  });

  it("clears avatar_path on remove, deletes the object, and does not upload", async () => {
    const { client, update, upload, remove } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await updateOrganizationProfile(
      ORG_NAME,
      form({ display_name: "Acme", email: "a@acme.com", remove_avatar: "1" })
    );

    expect(upload).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith([`${ORG_ID}/avatar`]);
    expect(update.mock.calls[0][0]).toMatchObject({ avatar_path: null });
  });

  it("rejects a spoofed MIME — accepted File.type but disallowed magic bytes", async () => {
    const { client, upload } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    // Claims to be a PNG, but the bytes are a real GIF (not an accepted type).
    await expect(
      updateOrganizationProfile(
        ORG_NAME,
        form({
          display_name: "Acme",
          email: "a@acme.com",
          avatar: imageFile("image/png", 1024, "a.png", MAGIC.gif),
        })
      )
    ).rejects.toThrow(/unsupported image type/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects a file whose bytes match no accepted image signature", async () => {
    const { client } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      updateOrganizationProfile(
        ORG_NAME,
        form({
          display_name: "Acme",
          email: "a@acme.com",
          // Zero-filled buffer: no magic match.
          avatar: imageFile("image/png", 1024),
        })
      )
    ).rejects.toThrow(/unsupported image type/);
  });

  it("rejects when display_name is missing", async () => {
    const { client, update } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      updateOrganizationProfile(ORG_NAME, form({ email: "a@acme.com" }))
    ).rejects.toThrow(/display name is required/);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects when email is missing", async () => {
    const { client, update } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      updateOrganizationProfile(ORG_NAME, form({ display_name: "Acme" }))
    ).rejects.toThrow(/email is required/);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects images larger than 2MB", async () => {
    const { client } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      updateOrganizationProfile(
        ORG_NAME,
        form({
          display_name: "Acme",
          email: "a@acme.com",
          avatar: imageFile("image/png", 2 * 1024 * 1024 + 1),
        })
      )
    ).rejects.toThrow(/too large/);
  });
});
