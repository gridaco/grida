import { useState, useEffect, useRef } from "react";

/**
 * https://stackoverflow.com/questions/45514676/react-check-if-element-is-visible-in-dom
 * https://stackoverflow.com/questions/59424347/gatsby-intersectionobserver-is-not-defined
 * @param ref
 * @returns
 */
export default function useOnScreen(ref) {
  const [isIntersecting, setIntersecting] = useState(false);

  const observer: any = useRef();

  useEffect(() => {
    observer.current = new IntersectionObserver(([entry]) =>
      setIntersecting(entry.isIntersecting),
    );
    observer.current.observe(ref.current);
    // Remove the observer as soon as the component is unmounted
    return () => {
      observer.current.disconnect();
    };
  }, []);

  return isIntersecting;
}
