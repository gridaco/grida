import { WebPreview } from "@grida/desktop-bridge";

/** Presentation derived from an immutable, completed assistant reply. */
export namespace ResponseCards {
  export type Card = Readonly<{
    kind: "web-preview";
    url: string;
  }>;

  type Reply = Readonly<{ text: string }>;
  type Detector = (text: string) => Card | null;

  const detectors: readonly Detector[] = [detectWebPreview];
  const empty: readonly Card[] = [];
  const cache = new WeakMap<Reply, readonly Card[]>();

  /** Call with a settled reply owned by the loaded transcript. */
  export function forReply(reply: Reply): readonly Card[] {
    const cached = cache.get(reply);
    if (cached) return cached;

    const cards: Card[] = [];
    for (const detect of detectors) {
      const card = detect(reply.text);
      if (card) cards.push(card);
    }
    const result = cards.length ? cards : empty;
    cache.set(reply, result);
    return result;
  }

  const urlPattern = /\bhttps?:\/\/[^\s<>)"'`]+/gi;
  const trailingPunctuation = /[.,;!?]+$/u;
  const delimiters = /[()[\]]/u;

  function detectWebPreview(text: string): Card | null {
    let href: string | undefined;
    // Scan raw text so bare URLs, code, and Markdown destinations share a rule.
    // When the label is itself a URL, the Markdown delimiters fall in the match.
    for (const [match] of text.matchAll(urlPattern)) {
      const candidate = match.replace(trailingPunctuation, "");
      const url = URL.parse(candidate);
      if (
        !url ||
        delimiters.test(url.pathname) ||
        delimiters.test(url.search) ||
        delimiters.test(url.hash)
      )
        continue;

      const normalized = WebPreview.normalizeUrl(candidate);
      if (!normalized) continue;
      if (href && href !== normalized) return null;
      href = normalized;
    }

    return href ? { kind: "web-preview", url: href } : null;
  }
}
