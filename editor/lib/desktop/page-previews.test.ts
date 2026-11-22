import { expect, it, vi } from "vitest";
import type { WebPreview } from "@grida/desktop-bridge";
import { PagePreviews } from "./page-previews";

const url = "http://localhost:4173/plan?view=run";
const available = { metadata: { productLabel: "FX Viewer" } };

it("shares a lookup with active and passive consumers of the same URL", async () => {
  const pending = Promise.withResolvers<WebPreview.Result | null>();
  const lookup = vi.fn<PagePreviews.Lookup>(() => pending.promise);
  const previews = new PagePreviews.Controller(lookup);
  const card = previews.forUrl(url)!;
  const link = previews.forUrl(`${url}#details`)!;
  const changed = vi.fn<() => void>();
  const unsubscribe = link.subscribe(changed);
  await Promise.resolve();
  expect(lookup).not.toHaveBeenCalled();

  const releaseCard = card.request();
  const releaseHover = link.request();
  await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(1));
  const [address, signal] = lookup.mock.calls[0];
  expect(address).toBe(url);
  releaseCard();
  expect(signal.aborted).toBe(false);
  pending.resolve(available);
  await vi.waitFor(() =>
    expect(link.getSnapshot().metadata).toEqual(available.metadata)
  );
  expect(card.getSnapshot()).toBe(link.getSnapshot());
  expect(changed).toHaveBeenCalledTimes(2);
  releaseHover();
  unsubscribe();
});

it("retains metadata on canceled or skipped checks and clears it on a confirmed miss", async () => {
  const lookup = vi.fn<PagePreviews.Lookup>().mockResolvedValueOnce(available);
  const previews = new PagePreviews.Controller(lookup);
  const preview = previews.forUrl(url)!;
  const unsubscribe = preview.subscribe(() => {});
  preview.request();
  await vi.waitFor(() =>
    expect(preview.getSnapshot().metadata).toEqual(available.metadata)
  );

  const stale = Promise.withResolvers<WebPreview.Result | null>();
  lookup.mockReturnValueOnce(stale.promise);
  const cancel = preview.request();
  await vi.waitFor(() => expect(lookup).toHaveBeenCalledTimes(2));
  cancel();
  expect(lookup.mock.calls[1][1].aborted).toBe(true);
  expect(preview.getSnapshot().metadata).toEqual(available.metadata);

  lookup.mockResolvedValueOnce(null);
  preview.request();
  await vi.waitFor(() => expect(preview.getSnapshot().loading).toBe(false));
  expect(preview.getSnapshot().metadata).toEqual(available.metadata);

  lookup.mockResolvedValueOnce({ metadata: null });
  preview.request();
  stale.resolve(available);
  await vi.waitFor(() =>
    expect(preview.getSnapshot()).toEqual(PagePreviews.empty)
  );
  unsubscribe();
});
