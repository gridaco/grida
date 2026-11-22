type Watch = {
  observer: IntersectionObserver;
  cards: Map<Element, (visible: boolean) => void>;
};

const watches = new WeakMap<Document, Watch>();

/** One viewport observer per document. Visibility signals interest in a preview. */
export function observeWebPreview(
  target: Element,
  request: () => () => void
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
  let release: (() => void) | undefined;
  cards.set(target, (visible) => {
    if (visible) {
      release ??= request();
    } else {
      release?.();
      release = undefined;
    }
  });
  observer.observe(target);
  return () => {
    observer.unobserve(target);
    cards.delete(target);
    release?.();
    if (!cards.size) {
      observer.disconnect();
      watches.delete(document);
    }
  };
}
