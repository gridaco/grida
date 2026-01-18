import React from "react";
import { cn } from "@/components/lib/utils";

export function PreferenceBox({
  warning,
  beta,
  disabled,
  children,
}: React.PropsWithChildren<{
  beta?: boolean;
  warning?: boolean;
  disabled?: boolean;
}>) {
  return (
    <section
      data-warning={warning || beta}
      className={cn(
        "bg-card rounded-md border border-overlay shadow-sm overflow-hidden mb-8 !m-0",
        "data-[warning='true']:border-yellow-400 data-[warning='true']:bg-yellow-50 data-[warning='true']:text-yellow-900 data-[warning='true']:dark:bg-yellow-700 data-[warning='true']:dark:text-yellow-200 data-[warning='true']:dark:border-yellow-600",
        disabled && "opacity-50 pointer-events- cursor-not-allowed"
      )}
    >
      {children}
    </section>
  );
}

export function PreferenceBody({ children }: React.PropsWithChildren) {
  return <div className="px-6 py-4">{children}</div>;
}

export function PreferenceBoxHeader({
  heading,
  description,
  actions,
}: {
  heading?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex items-center px-6 py-4 border-b">
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-x-2">
          <div>
            <h2 className="text-lg font-semibold">{heading}</h2>
            {description && (
              <PreferenceDescription>{description}</PreferenceDescription>
            )}
          </div>
        </div>
        {/* trailing */}
        {actions}
      </div>
    </header>
  );
}

export function PreferenceBoxFooter({ children }: React.PropsWithChildren) {
  return (
    <footer className="bg-surface-100 border-t border-overlay">
      <div className="flex h-16 items-center px-6">
        <div className="flex w-full items-center gap-2 justify-end">
          <div className="flex items-center gap-2">{children}</div>
        </div>
      </div>
    </footer>
  );
}

export function PreferenceDescription({ children }: React.PropsWithChildren) {
  return <p className="my-2 text-sm opacity-50">{children}</p>;
}

export function Sector({
  id,
  children,
}: React.PropsWithChildren<{
  id?: string;
}>) {
  return (
    <section className="py-5" id={id}>
      {children}
    </section>
  );
}

export function SectorHeader({ children }: React.PropsWithChildren) {
  return <header className="flex flex-col gap-1 mb-4">{children}</header>;
}

export function SectorHeading({
  className,
  children,
  ...props
}: React.PropsWithChildren<React.HTMLAttributes<HTMLHeadingElement>>) {
  return (
    <h1 {...props} className={cn("text-xl font-medium py-2", className)}>
      {children}
    </h1>
  );
}

export function SectorDescription({ children }: React.PropsWithChildren) {
  return <span className="text-sm opacity-50">{children}</span>;
}

export function SectorBlocks({ children }: React.PropsWithChildren) {
  return <div className="flex flex-col gap-8">{children}</div>;
}
