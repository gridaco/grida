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

function imageFile(type: string, bytes: number, name = "a.png") {
  return new File([new Uint8Array(bytes)], name, { type });
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
        avatar: imageFile("image/png", 1024),
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

  it("rejects unsupported image types", async () => {
    const { client } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);

    await expect(
      updateOrganizationProfile(
        ORG_NAME,
        form({
          display_name: "Acme",
          email: "a@acme.com",
          avatar: imageFile("image/gif", 1024, "a.gif"),
        })
      )
    ).rejects.toThrow(/unsupported image type/);
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
