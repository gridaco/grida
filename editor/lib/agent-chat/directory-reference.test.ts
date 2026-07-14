import { describe, expect, it } from "vitest";
import { USER_DIRECTORY_REFERENCES } from "@grida/agent";
import { AgentDirectoryReference } from "./directory-reference";

describe("AgentDirectoryReference", () => {
  it("lowers already-typed descriptors in order", () => {
    const one = "dir_11111111-1111-4111-8111-111111111111";
    const descriptor = {
      kind: "scope",
      id: one,
      name: "one",
      path: `/__references__/${one}`,
      access: "read",
    } as const;

    expect(AgentDirectoryReference.fromDescriptors([descriptor])).toEqual({
      type: USER_DIRECTORY_REFERENCES,
      data: { directories: [descriptor] },
    });
    expect(AgentDirectoryReference.fromDescriptors([])).toBeNull();
  });

  it("lowers ordered directory-ref parts to the registered context token", () => {
    const one = "dir_11111111-1111-4111-8111-111111111111";
    const two = "dir_22222222-2222-4222-8222-222222222222";
    const context = AgentDirectoryReference.extract([
      { type: "text" },
      {
        type: "directory-ref",
        ref: {
          kind: "scope",
          id: one,
          name: "one",
          path: `/__references__/${one}`,
          access: "read",
        },
      },
      {
        type: "directory-ref",
        ref: {
          kind: "scope",
          id: two,
          name: "two",
          path: `/__references__/${two}`,
          access: "read",
        },
      },
    ]);

    expect(context).toEqual({
      type: USER_DIRECTORY_REFERENCES,
      data: {
        directories: [
          {
            kind: "scope",
            id: one,
            name: "one",
            path: `/__references__/${one}`,
            access: "read",
          },
          {
            kind: "scope",
            id: two,
            name: "two",
            path: `/__references__/${two}`,
            access: "read",
          },
        ],
      },
    });
  });

  it("does not lower malformed or non-directory parts", () => {
    expect(
      AgentDirectoryReference.extract([
        { type: "file-attachment" },
        {
          type: "directory-ref",
          ref: { kind: "scope", id: "dir_bad", name: "bad", path: "/x" },
        },
      ])
    ).toBeNull();
  });

  it("publicly validates host-minted descriptors", () => {
    const id = "dir_11111111-1111-4111-8111-111111111111";
    expect(
      AgentDirectoryReference.isDescriptor({
        kind: "scope",
        id,
        name: "references",
        path: `/__references__/${id}`,
        access: "read",
      })
    ).toBe(true);
    expect(
      AgentDirectoryReference.isDescriptor({
        kind: "scope",
        id,
        name: "references",
        path: "/Users/alice/references",
        access: "read",
      })
    ).toBe(false);
  });
});
