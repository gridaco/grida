import type { WebPreview } from "@grida/desktop-bridge";
import type { Browser } from "@/lib/desktop/browser";

type Watch = {
  observer: IntersectionObserver;
  cards: Map<Element, (visible: boolean) => void>;
};

const watches = new WeakMap<Document, Watch>();

/** One viewport observer per document, with a lookup per visible card. */
export function observeWebPreview(
  target: Element,
  url: string,
  load: Browser.PreviewLoader,
  publish: (metadata: WebPreview.Metadata | null) => void
): () => void {
  const document = target.ownerDocument;
  const Observer = document.defaultView?.IntersectionObserver;
  if (!Observer) return () => {};
  let watch = watches.get(document);
  if (!watch) {
    const cards: Watch["cards"] = new Map();
    const observer = new Observer((entries) => {
      for (const entry of entries)
        cards.get(entry.target)?.(entry.isIntersecting);
    });
    watch = { observer, cards };
    watches.set(document, watch);
  }
  const { observer, cards } = watch;
  let pending: AbortController | undefined;
  let watching = true;
  let inView = false;
  const stop = () => {
    if (!watching) return;
    watching = false;
    observer.unobserve(target);
    cards.delete(target);
    pending?.abort();
    if (!cards.size) {
      observer.disconnect();
      watches.delete(document);
    }
  };
  cards.set(target, (visible) => {
    if (inView === visible) return;
    inView = visible;
    if (!inView) {
      pending?.abort();
      pending = undefined;
      return;
    }
    const request = new AbortController();
    pending = request;
    void Promise.resolve()
      .then(() => (request.signal.aborted ? null : load(url, request.signal)))
      .catch(() => null)
      .then((metadata) => {
        if (!request.signal.aborted) {
          pending = undefined;
          publish(metadata);
        }
      });
  });
  observer.observe(target);
  return stop;
}
