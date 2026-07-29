import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMAGE_ATTACHMENT_POLICY } from "@/lib/agent-chat";

type LibraryActions = typeof import("@/app/(library)/library/actions");

const actions = vi.hoisted(() => ({
  browse: vi.fn<LibraryActions["browse"]>(),
  search: vi.fn<LibraryActions["search"]>(),
  similar: vi.fn<LibraryActions["similar"]>(),
}));

vi.mock("@/app/(library)/library/actions", () => actions);

import {
  resolveDesignBrowsePage,
  resolveLibraryExplorerPage,
} from "./design-search";

describe("resolveDesignBrowsePage", () => {
  beforeEach(() => {
    actions.browse.mockReset();
    actions.search.mockReset();
    actions.similar.mockReset();
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

describe("resolveLibraryExplorerPage", () => {
  beforeEach(() => {
    actions.browse.mockReset();
    actions.search.mockReset();
    actions.similar.mockReset();
  });

  it("pages the browse source without promoting an estimate to a bound", async () => {
    type BrowseResult = Awaited<ReturnType<LibraryActions["browse"]>>;
    type BrowseItem = BrowseResult["data"][number];
    actions.browse.mockResolvedValue({
      data: [
        {
          id: "ref-0",
          title: "Curated poster",
          alt: null,
          url: "https://example.com/ref-0.png",
          width: 1200,
          height: 1600,
          mimetype: "image/png",
        } as BrowseItem,
      ],
      count: 631,
    });

    await expect(
      resolveLibraryExplorerPage({ kind: "browse" }, [30, 59])
    ).resolves.toEqual({
      items: [
        {
          id: "ref-0",
          title: "Curated poster",
          url: "https://example.com/ref-0.png",
          width: 1200,
          height: 1600,
          mime: "image/png",
        },
      ],
      exactCount: undefined,
    });
    expect(actions.browse).toHaveBeenCalledWith({ range: [30, 59] });
  });

  it("does not swallow a browse failure", async () => {
    actions.browse.mockRejectedValue(new Error("browse failed"));

    await expect(
      resolveLibraryExplorerPage({ kind: "browse" }, [0, 29])
    ).rejects.toThrow("browse failed");
  });

  it("pages and maps a committed search query", async () => {
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
          mimetype: "image/png",
        } as SearchItem,
      ],
      count: 42,
    });

    await expect(
      resolveLibraryExplorerPage(
        { kind: "search", query: "red editorial poster" },
        [30, 59]
      )
    ).resolves.toEqual({
      items: [
        {
          id: "ref-1",
          title: "Editorial poster",
          url: "https://example.com/ref-1.png",
          width: 1200,
          height: 1600,
          mime: "image/png",
        },
      ],
      exactCount: undefined,
    });
    expect(actions.search).toHaveBeenCalledWith({
      text: "red editorial poster",
      range: [30, 59],
    });
  });

  it("pages the similarity source without promoting an estimate to a bound", async () => {
    type SimilarResult = Awaited<ReturnType<LibraryActions["similar"]>>;
    type SimilarItem = NonNullable<SimilarResult["data"]>[number];
    actions.similar.mockResolvedValue({
      data: [
        {
          id: "ref-2",
          title: "Related poster",
          alt: null,
          url: "https://example.com/ref-2.png",
          width: 1200,
          height: 1600,
          mimetype: "image/png",
        } as SimilarItem,
      ],
      error: null,
    });

    await expect(
      resolveLibraryExplorerPage(
        { kind: "similar", objectId: "ref-1" },
        [30, 59]
      )
    ).resolves.toEqual({
      items: [
        {
          id: "ref-2",
          title: "Related poster",
          url: "https://example.com/ref-2.png",
          width: 1200,
          height: 1600,
          mime: "image/png",
        },
      ],
      exactCount: undefined,
    });
    expect(actions.similar).toHaveBeenCalledWith("ref-1", {
      range: [30, 59],
    });
  });

  it("does not swallow a similarity error", async () => {
    actions.similar.mockResolvedValue({
      data: null,
      error: new Error("similar failed"),
    });

    await expect(
      resolveLibraryExplorerPage(
        { kind: "similar", objectId: "ref-1" },
        [0, 29]
      )
    ).rejects.toThrow("similar failed");
  });
});
