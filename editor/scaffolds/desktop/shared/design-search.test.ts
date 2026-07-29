import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_ATTACHMENT_POLICY } from "@/lib/agent-chat";

type LibraryActions = typeof import("@/app/(library)/library/actions");

const actions = vi.hoisted(() => ({
  browse: vi.fn<LibraryActions["browse"]>(),
  search: vi.fn<LibraryActions["search"]>(),
}));

vi.mock("@/app/(library)/library/actions", () => actions);

import {
  resolveDesignBrowsePage,
  resolveDesignSearchPage,
} from "./design-search";

describe("resolveDesignBrowsePage", () => {
  beforeEach(() => {
    actions.browse.mockReset();
    actions.search.mockReset();
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

describe("resolveDesignSearchPage", () => {
  beforeEach(() => {
    actions.search.mockReset();
  });

  it("forwards the committed query and page range, then maps the result", async () => {
    type SearchResult = Awaited<ReturnType<LibraryActions["search"]>>;
    type SearchItem = SearchResult["data"][number];
    actions.search.mockResolvedValue({
      data: [
        {
          id: "ref-1",
          title: "Editorial poster",
          alt: "A red editorial poster",
          url: "https://example.com/ref-1.png",
          width: 1200,
          height: 1600,
        } as SearchItem,
      ],
      count: 42,
    });

    await expect(
      resolveDesignSearchPage("red editorial poster", [30, 59])
    ).resolves.toEqual({
      items: [
        {
          id: "ref-1",
          title: "Editorial poster",
          url: "https://example.com/ref-1.png",
          width: 1200,
          height: 1600,
        },
      ],
      count: 42,
    });
    expect(actions.search).toHaveBeenCalledWith({
      text: "red editorial poster",
      range: [30, 59],
    });
  });
});
