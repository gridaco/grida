/**
 * Unit tests for `updateOrganizationProfile` — the org General settings server
 * action. The supabase clients and `next/cache` are mocked; these assert the
 * pure decision logic: the membership gate, avatar validation, the
 * `org-{id}/avatar` path scheme + upsert upload, and the remove flow.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Typed `vi.fn` shorthand (repo lint requires explicit mock type parameters).
const fn = () => vi.fn<(...args: never[]) => unknown>();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn<(...args: never[]) => void>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn<(...args: never[]) => unknown>(),
  service_role: {
    workspace: {
      storage: {
        from: vi.fn<(...args: never[]) => unknown>(),
      },
    },
  },
}));

import { createClient, service_role } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { updateOrganizationProfile } from "../actions";

const mockedCreateClient = vi.mocked(createClient);

const ORG_NAME = "acme";
const ORG_ID = 42;

/** Build a user-authed client stub whose `.from()` chain captures the update. */
function makeUserClient(opts: { member?: boolean } = {}) {
  const member = opts.member ?? true;
  const update = fn().mockReturnValue({
    eq: fn().mockResolvedValue({ error: null }),
  });

  const client = {
    auth: {
      getUser: fn().mockResolvedValue({ data: { user: { id: "u1" } } }),
    },
    from: vi.fn<(table: string) => unknown>((table: string) => {
      if (table !== "organization")
        throw new Error(`unexpected table ${table}`);
      return {
        // org lookup / membership gate
        select: fn().mockReturnValue({
          eq: fn().mockReturnValue({
            single: fn().mockResolvedValue(
              member
                ? { data: { id: ORG_ID }, error: null }
                : { data: null, error: { message: "forbidden" } }
            ),
          }),
        }),
        // profile update
        update,
      };
    }),
  };
  return { client, update };
}

/** Capture the storage upload call. */
function stubUpload(result: { error: unknown } = { error: null }) {
  const upload = fn().mockResolvedValue(result);
  vi.mocked(service_role.workspace.storage.from).mockReturnValue({
    upload,
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial storage stub
  } as any);
  return upload;
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
    const { client, update } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);
    const upload = stubUpload();

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

  it("uploads to org-{id}/avatar (upsert) and writes avatar_path on valid image", async () => {
    const { client, update } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);
    const upload = stubUpload();

    await updateOrganizationProfile(
      ORG_NAME,
      form({
        display_name: "Acme",
        email: "a@acme.com",
        avatar: imageFile("image/png", 1024),
      })
    );

    expect(service_role.workspace.storage.from).toHaveBeenCalledWith("avatars");
    const [path, , options] = upload.mock.calls[0];
    expect(path).toBe(`org-${ORG_ID}/avatar`);
    expect(options).toMatchObject({ upsert: true, contentType: "image/png" });
    expect(update.mock.calls[0][0]).toMatchObject({
      avatar_path: `org-${ORG_ID}/avatar`,
    });
  });

  it("clears avatar_path on remove and does not upload", async () => {
    const { client, update } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);
    const upload = stubUpload();

    await updateOrganizationProfile(
      ORG_NAME,
      form({ display_name: "Acme", email: "a@acme.com", remove_avatar: "1" })
    );

    expect(upload).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0]).toMatchObject({ avatar_path: null });
  });

  it("rejects unsupported image types", async () => {
    const { client } = makeUserClient();
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- partial client stub
    mockedCreateClient.mockResolvedValue(client as any);
    stubUpload();

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
    stubUpload();

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
