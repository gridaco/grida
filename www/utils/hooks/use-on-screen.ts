import { useState, useEffect, useRef } from "react";

/**
 * https://stackoverflow.com/questions/45514676/react-check-if-element-is-visible-in-dom
 * https://stackoverflow.com/questions/59424347/gatsby-intersectionobserver-is-not-defined
 * @param ref
 * @returns
 */
export default function useOnScreen(
  ref,
  options?: {
    threshold?: number | number[];
    rootMargin?: number | string;
  },
) {
  const { threshold, rootMargin } = options;
  const [isIntersecting, setIntersecting] = useState(false);

  const observer: any = useRef();

  useEffect(() => {
    observer.current = new IntersectionObserver(
      ([entry]) => {
        setIntersecting(entry.isIntersecting);
      },
      {
        threshold: threshold ? threshold : 0.5,
        rootMargin:
          typeof rootMargin == "number" ? `${rootMargin}px` : rootMargin,
      },
    );
    if (ref) {
      observer.current.observe(ref.current);
    }
    // Remove the observer as soon as the component is unmounted
    return () => {
      try {
        observer.current.unobserve(ref.current);
      } catch (e) {}
    };
  }, [ref]);

  return isIntersecting;
}
