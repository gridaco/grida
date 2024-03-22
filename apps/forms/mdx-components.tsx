import type { MDXComponents } from "mdx/types";

// This file is required to use MDX in `app` directory.
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Allows customizing built-in components, e.g. to add styling.
    h1: ({ children }) => (
      <h1 className="py-10 text-4xl font-bold text-gray-900 sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="py-5 text-3xl font-bold text-gray-800 sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="py-3 text-2xl font-bold text-gray-700 sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="py-2 text-xl font-bold text-gray-600 sm:text-2xl md:text-3xl lg:text-4xl xl:text-5xl">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="py-2 text-lg font-bold text-gray-500 sm:text-xl md:text-2xl lg:text-3xl xl:text-4xl">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="py-1 text-base font-bold text-gray-400 sm:text-lg md:text-xl lg:text-2xl xl:text-3xl">
        {children}
      </h6>
    ),
    p: ({ children }) => <p className="text-lg text-gray-900">{children}</p>,
    ...components,
  };
}
