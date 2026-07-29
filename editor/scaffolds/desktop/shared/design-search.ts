/**
 * App-side library search for the agent's `design_search` pick card. The tool is
 * human-input: the card (kit) calls this to fetch the result gallery the user
 * picks from. It runs in the renderer because the library client needs the
 * editor's session, which the agent sidecar deliberately lacks (GRIDA-SEC).
 *
 * Full-corpus for now; scoping to a curated "good" collection is deferred (it
 * needs a DB migration, sequenced last). Library pins stay URLs — nothing is
 * downloaded; a picked pin's url is fed straight into image-to-image.
 */

import { browse, search, similar } from "@/app/(library)/library/actions";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import { IMAGE_ATTACHMENT_POLICY } from "@/lib/agent-chat";
import type {
  LibraryExplorerPage,
  LibraryExplorerSource,
} from "@/kits/library-explorer";

/** A first-party Library pin carries the source MIME in addition to the agent
 *  tool's provider-neutral result shape. Composer attachments need it to build
 *  an honest provider-native file part without guessing from the URL. */
export type DesignLibraryPin = AgentDesignSearch.DesignSearchResult & {
  mime: string;
};

/** Host-fixed result count — not an agent knob (TOOL-DESIGN doctrine). */
const MAX_RESULTS = 24;

/** Page size for the paginated (infinite-scroll) picker surface. */
export const DESIGN_SEARCH_PAGE = 30;

function toPin(o: {
  id: string;
  title?: string | null;
  alt?: string | null;
  url: string;
  width: number;
  height: number;
}): AgentDesignSearch.DesignSearchResult {
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

/** Run the library search; throw on failure (the card shows an error state).
 *  One-shot (first {@link MAX_RESULTS}) — the compact ai-sidebar pick card. */
export async function resolveDesignSearch(
  query: string
): Promise<AgentDesignSearch.DesignSearchResult[]> {
  const { data } = await search({ text: query, range: [0, MAX_RESULTS - 1] });
  return data.map(toPin);
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
