import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_ATTACHMENT_POLICY } from "@/lib/agent-chat";

type LibraryActions = typeof import("@/app/(library)/library/actions");

const actions = vi.hoisted(() => ({
  browse: vi.fn<LibraryActions["browse"]>(),
  search: vi.fn<LibraryActions["search"]>(),
}));

vi.mock("@/app/(library)/library/actions", () => actions);

import { resolveDesignBrowsePage } from "./design-search";

describe("resolveDesignBrowsePage", () => {
  beforeEach(() => {
    actions.browse.mockReset();
    actions.browse.mockResolvedValue({ data: [], count: 0 });
  });

  it("keeps the general reference gallery unfiltered", async () => {
    await resolveDesignBrowsePage([0, 29]);

    expect(actions.browse).toHaveBeenCalledWith({ range: [0, 29] });
  });

  it("queries only model-attachable raster images for the composer picker", async () => {
    await resolveDesignBrowsePage([0, 29], {
      attachmentImagesOnly: true,
    });

    expect(actions.browse).toHaveBeenCalledWith({
      range: [0, 29],
      mimetypes: [...IMAGE_ATTACHMENT_POLICY.acceptMimes],
    });
  });
});
