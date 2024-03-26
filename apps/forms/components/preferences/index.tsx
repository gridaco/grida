import clsx from "clsx";

export function PreferenceBox({
  beta,
  children,
}: React.PropsWithChildren<{
  beta?: boolean;
}>) {
  return (
    <section
      data-beta={beta}
      className={clsx(
        "rounded-md border border-overlay shadow-sm overflow-hidden mb-8 !m-0",
        beta &&
          "border-yellow-400 bg-yellow-50 text-yellow-900 dark:bg-yellow-700 dark:text-yellow-200 dark:border-yellow-600"
      )}
    >
      {children}
    </section>
  );
}

export function PreferenceBody({ children }: React.PropsWithChildren<{}>) {
  return <div className="px-6 py-4">{children}</div>;
}

export function PreferenceBoxHeader({
  heading,
  headingBadge,
  actions,
}: {
  heading?: React.ReactNode;
  headingBadge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-center px-6 py-4">
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <p>{heading}</p>
          {headingBadge && (
            <div className="inline-flex items-center rounded-full bg-opacity-10 bg-surface-200 text-foreground-light border border-strong px-2.5 py-0.5 text-xs">
              {headingBadge}
            </div>
          )}
        </div>
        {/* trailing */}
        {actions}
      </div>
    </header>
  );
}

export function PreferenceBoxFooter({ children }: React.PropsWithChildren<{}>) {
  return (
    <footer className="bg-surface-100 border-t border-overlay">
      <div className="flex h-12 items-center px-6">
        <div className="flex w-full items-center gap-2 justify-end">
          <div className="flex items-center gap-2">{children}</div>
        </div>
      </div>
    </footer>
  );
}
