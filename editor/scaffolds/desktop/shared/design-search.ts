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

import { browse, search } from "@/app/(library)/library/actions";
import type { AgentDesignSearch } from "@grida/agent/tools/design-search";
import { IMAGE_ATTACHMENT_POLICY } from "@/lib/agent-chat";

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

/** A page of results for the infinite-scroll picker surface. `count` is the
 *  candidate universe (total pickable rows) the loader pages through; it may be
 *  undefined when the backend can't estimate it. */
export type DesignSearchPage = {
  items: AgentDesignSearch.DesignSearchResult[];
  count: number | undefined;
};

export type DesignLibraryPage = {
  items: DesignLibraryPin[];
  count: number | undefined;
};

/** Fetch one inclusive `[start, end]` range of results — the dedicated
 *  editor-pane picker's paginated fetch (`search` paginates semantic queries via
 *  match_count/match_offset; see `(library)/library/actions.ts`). */
export async function resolveDesignSearchPage(
  query: string,
  range: [number, number]
): Promise<DesignSearchPage> {
  const { data, count } = await search({ text: query, range });
  return { items: data.map(toPin), count: count ?? undefined };
}

/** Cold-browse a page of the curated corpus (no query) — the home reference
 *  gallery's fetch. Same {@link DesignSearchPage} shape as the query path so a
 *  gallery can page through either identically. */
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
