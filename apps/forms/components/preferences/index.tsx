import clsx from "clsx";

export const cls_input =
  "bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 disabled:opacity-50 disabled:bg-neutral-200 disabled:border-neutral-300 disabled:text-neutral-500";

export const cls_textarea =
  "block p-2.5 w-full text-sm text-neutral-900 bg-neutral-50 rounded-lg border border-neutral-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500";

export function PreferenceBox({
  warning,
  beta,
  children,
}: React.PropsWithChildren<{
  beta?: boolean;
  warning?: boolean;
}>) {
  return (
    <section
      data-warning={warning || beta}
      className={clsx(
        "rounded-md border border-overlay shadow-sm overflow-hidden mb-8 !m-0",
        "data-[warning='true']:border-yellow-400 data-[warning='true']:bg-yellow-50 data-[warning='true']:text-yellow-900 data-[warning='true']:dark:bg-yellow-700 data-[warning='true']:dark:text-yellow-200 data-[warning='true']:dark:border-yellow-600"
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
          <h2 className="text-lg font-semibold">{heading}</h2>
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

export function Sector({ children }: React.PropsWithChildren<{}>) {
  return <section className="py-5">{children}</section>;
}

export function SectorHeader({ children }: React.PropsWithChildren<{}>) {
  return <header className="flex flex-col gap-1 mb-4">{children}</header>;
}

export function SectorHeading({ children }: React.PropsWithChildren<{}>) {
  return <h1 className="text-xl font-medium py-2">{children}</h1>;
}

export function SectorDescription({ children }: React.PropsWithChildren<{}>) {
  return <span className="text-sm opacity-50">{children}</span>;
}

export function SectorBlocks({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col gap-8">{children}</div>;
}
