/**
 * App-side Library pages for the Desktop reference gallery, the embedded
 * Library explorer and the chat attachment picker. They run in the renderer
 * because the Library client needs the editor's session.
 *
 * Full-corpus for now; scoping to a curated "good" collection is deferred (it
 * needs a DB migration, sequenced last). Library pins stay URLs — nothing is
 * downloaded.
 */

import { browse, search, similar } from "@/app/(library)/library/actions";
import type { chat_vocabulary } from "@/lib/agent-chat/chat-vocabulary";
import { IMAGE_ATTACHMENT_POLICY } from "@/lib/agent-chat/image-attachment";
import type {
  LibraryExplorerPage,
  LibraryExplorerSource,
} from "@/kits/library-explorer";

/** A first-party Library pin carries the source MIME in addition to the
 *  provider-neutral reference shape, so attachments need not guess it from
 *  the URL. */
export type DesignLibraryPin = chat_vocabulary.DesignReference & {
  mime: string;
};

/** Page size for the paginated (infinite-scroll) picker surface. */
export const DESIGN_SEARCH_PAGE = 30;

function toPin(o: {
  id: string;
  title?: string | null;
  alt?: string | null;
  url: string;
  width: number;
  height: number;
}): chat_vocabulary.DesignReference {
  return {
    id: o.id,
    title: o.title ?? o.alt ?? "Untitled",
    url: o.url,
    width: o.width,
    height: o.height,
  };
}

function toLibraryPin(o: {
  id: string;
  title?: string | null;
  alt?: string | null;
  url: string;
  width: number;
  height: number;
  mimetype: string;
}): DesignLibraryPin {
  return { ...toPin(o), mime: o.mimetype };
}

export type DesignLibraryPage = {
  items: DesignLibraryPin[];
  count: number | undefined;
};

/**
 * One injected page source for the embedded Library explorer. The kit stays
 * route/I/O agnostic; this Desktop seam binds its source values to the existing
 * public Library actions. Their PostgREST totals are estimates (and semantic
 * search's candidate count is narrower than its RPC), so they are not exposed
 * as terminal bounds; a short page is the authoritative end of this feed.
 */
export async function resolveLibraryExplorerPage(
  source: LibraryExplorerSource,
  range: [number, number]
): Promise<LibraryExplorerPage> {
  if (source.kind === "browse") {
    const { data } = await browse({ range });
    return { items: data.map(toLibraryPin), exactCount: undefined };
  }

  if (source.kind === "search") {
    const { data } = await search({ text: source.query, range });
    return { items: data.map(toLibraryPin), exactCount: undefined };
  }

  const { data, error } = await similar(source.objectId, { range });
  if (error) throw error;
  return { items: (data ?? []).map(toLibraryPin), exactCount: undefined };
}

/** Cold-browse a page of the curated corpus (no query) — the home reference
 *  gallery's fetch. It uses the same page shape as the embedded explorer so
 *  both paths paginate identically. */
export async function resolveDesignBrowsePage(
  range: [number, number],
  options: { attachmentImagesOnly?: boolean } = {}
): Promise<DesignLibraryPage> {
  const { data, count } = await browse({
    range,
    ...(options.attachmentImagesOnly
      ? { mimetypes: [...IMAGE_ATTACHMENT_POLICY.acceptMimes] }
      : {}),
  });
  return { items: data.map(toLibraryPin), count: count ?? undefined };
}
