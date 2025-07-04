"use client";
import React from "react";
import { useMeasure } from "@uidotdev/usehooks";

/**
 * Context for providing measured dimensions to child components.
 * Similar to visx's Responsive component, this provides a flexible way to
 * measure container dimensions and make them available to children.
 */
const SizeContext = React.createContext<{
  width: number;
  height: number;
} | null>(null);

/**
 * A flexible size provider component that measures its container dimensions
 * and provides them to child components via React Context.
 *
 * This component is similar to visx's Responsive component, offering a clean
 * way to make container dimensions available to child components without
 * prop drilling.
 *
 * @example
 * ```tsx
 * <SizeProvider className="w-full h-full">
 *   <Canvas
 *     width={100}
 *     height={100}
 *     data={{
 *       version: "0.0.1-beta.1+20250303",
 *       document: state,
 *     }}
 *   />
 * </SizeProvider>
 * ```
 *
 * @param props - HTML div attributes plus children
 * @param props.children - Child components that will have access to the measured dimensions
 * @param props.className - CSS classes for the container div
 * @param props.style - Inline styles for the container div
 * @param props.id - HTML id attribute for the container div
 * @returns A div element that measures itself and provides dimensions via context
 */
export function SizeProvider({
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const [ref, { width, height }] = useMeasure();
  const __measured = width !== null && height !== null;

  return (
    <div ref={ref} {...props}>
      <SizeContext.Provider value={__measured ? { width, height } : null}>
        {children}
      </SizeContext.Provider>
    </div>
  );
}

/**
 * Hook to access the measured dimensions from the nearest SizeProvider.
 *
 * This hook returns the measured width and height from the SizeContext,
 * or falls back to the provided default size if no SizeProvider is found
 * or if measurements are not yet available.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { width, height } = useSize({ width: 800, height: 600 });
 *
 *   return (
 *     <div>
 *       Container size: {width} x {height}
 *     </div>
 *   );
 * }
 * ```
 *
 * @param defaultSize - Default dimensions to use when no SizeProvider is available
 * @param defaultSize.width - Default width in pixels
 * @param defaultSize.height - Default height in pixels
 * @returns An object with width and height properties
 */
export function useSize(defaultSize: { width: number; height: number }) {
  const size = React.useContext(SizeContext);
  if (size) {
    return size;
  } else {
    return defaultSize;
  }
}
