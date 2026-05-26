import Link from "next/link";

export default function UIComponentsIndexPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-20">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Internal
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Grida UI Workbench
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        A working space for the components, primitives, and showcases that make
        up the Grida editor. Each entry is a live demo paired with the source
        that ships into production — used here for design review, cross-browser
        checks, and quick reproductions.
      </p>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        Pick a component from the sidebar to get started.
      </p>

      <hr className="my-8" />

      <p className="text-sm leading-relaxed text-muted-foreground">
        Grida is open source. This page isn&apos;t a published component
        registry, but the source for everything here lives in the repo — feel
        free to copy what you need.
      </p>
      <div className="mt-4">
        <Link
          href="https://github.com/gridaco/grida/tree/main/editor/app/(dev)/ui"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="currentColor"
            aria-hidden
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
          View source on GitHub
        </Link>
      </div>
    </main>
  );
}
