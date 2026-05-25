import * as React from "react";

export interface UseScrollSpyOptions {
  /**
   * Px from viewport top to the activation line — a section is "active"
   * once its top has scrolled past this line. Pick a value close to the
   * effective `scroll-margin-top` of the sections, which usually equals
   * the sticky header height.
   *
   * @default 120
   */
  activationLine?: number;

  /**
   * Optional scroll container. Defaults to `window`. Pass a ref to use a
   * specific scrollable element (e.g. when the page lives inside a scroll
   * panel rather than the window itself).
   */
  containerRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Tracks which of a list of in-document section ids is "currently active"
 * relative to the viewport — the standard docs-site "On this page"
 * highlight.
 *
 * Activation rule: among the sections whose top is at-or-above
 * `activationLine`, pick the last one in document order. When scrolled to
 * the very bottom of the page, the final section is forced active so a
 * short last section can still light up.
 *
 * **Why not `IntersectionObserver`?** The obvious approach is to observe
 * each section with an `IntersectionObserver` over a narrow band and pick
 * the topmost intersecting entry. That loses for tall sections: after a
 * click-to-anchor, the previous section's bottom edge still pokes into
 * the band, and its very-negative `boundingClientRect.top` makes it
 * sort as "topmost" — so §N-1 stays highlighted while §N is visible.
 * Scroll-position vs. a single line is deterministic and avoids the
 * partial-overlap race entirely.
 *
 * Returns the active section id, or `null` if none of the ids resolve
 * to a DOM element.
 */
export function useScrollSpy(
  sectionIds: readonly string[],
  options: UseScrollSpyOptions = {}
): string | null {
  const { activationLine = 120, containerRef } = options;
  const [active, setActive] = React.useState<string | null>(
    sectionIds[0] ?? null
  );

  React.useEffect(() => {
    if (sectionIds.length === 0) {
      setActive(null);
      return;
    }

    const container = containerRef?.current ?? null;
    const scrollTarget: Window | HTMLElement = container ?? window;

    let raf = 0;

    const update = () => {
      raf = 0;
      let current: string | null = sectionIds[0] ?? null;
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        // Position of the section's top relative to the activation line.
        // For window-scroll, `getBoundingClientRect` already gives
        // viewport-relative coords. For a custom container, subtract
        // the container's top so the line is interpreted relative to it.
        const sectionTop = el.getBoundingClientRect().top;
        const referenceTop = container
          ? container.getBoundingClientRect().top
          : 0;
        const relativeTop = sectionTop - referenceTop;
        if (relativeTop - activationLine <= 0) {
          current = id;
        } else {
          // Sections are in document order — once we pass the line, stop.
          break;
        }
      }

      // Bottom-of-scroll: force the last section active even if its top
      // never crosses the line (short pages / a tiny tail section).
      let atBottom: boolean;
      if (container) {
        atBottom =
          container.scrollTop + container.clientHeight >=
          container.scrollHeight - 2;
      } else {
        atBottom =
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 2;
      }
      if (atBottom) {
        current = sectionIds[sectionIds.length - 1];
      }

      setActive(current);
    };

    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };

    update();
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sectionIds, activationLine, containerRef]);

  return active;
}
