import * as Dialog from "@radix-ui/react-dialog";
import React from "react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@/components/ui/hover-card";
import { QuestionMarkCircledIcon } from "@radix-ui/react-icons";
import { cn } from "@/components/lib/utils";

export function SidePanel({
  children,
  trigger,
  ...props
}: React.PropsWithChildren<{
  trigger?: React.ReactNode;
}> &
  React.ComponentProps<typeof Dialog.Root>) {
  return (
    <Dialog.Root {...props}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay className="z-40 fixed bg-neutral-500/50 dark:bg-neutral-900/80 h-full w-full left-0 top-0 opacity-75 data-[state='closed']:animate-fade-out-overlay-bg data-[staet='open']:animate-fade-in-overlay-bg " />
        <Dialog.Content className="z-40 bg-background flex flex-col fixed inset-y-0 lg:h-screen border-l border-overlay shadow-xl  w-screen max-w-3xl h-full  right-0 data-[state='open']:animate-panel-slide-right-out data-[state='closed']:animate-panel-slide-right-in focus:outline-none">
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PanelPropertySection({
  children,
  grid = true,
  hidden = false,
}: React.PropsWithChildren<{
  grid?: boolean;
  hidden?: boolean;
}>) {
  return (
    <div
      data-hidden={hidden}
      data-grid={grid}
      className="grid grid-cols-12 data-[grid='false']:block gap-6 px-8 py-8 opacity-100 data-[hidden='true']:hidden"
    >
      {children}
    </div>
  );
}

export function PanelPropertySectionTitle({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <span className="col-span-12 text-sm lg:col-span-5 lg:!col-span-4">
      {children}
    </span>
  );
}

export function PanelPropertyFields({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative col-span-12 flex flex-col gap-6 lg:!col-span-8">
      {children}
    </div>
  );
}

export function PanelPropertyField({
  label,
  help,
  description,
  optional,
  children,
  disabled,
}: React.PropsWithChildren<{
  label: React.ReactNode;
  help?: React.ReactNode;
  description?: React.ReactNode;
  optional?: boolean;
  disabled?: boolean;
}>) {
  return (
    <fieldset disabled={disabled} className="disabled:opacity-50">
      <label className="text-sm grid gap-2 md:grid md:grid-cols-12">
        <div className="flex flex-row space-x-2 justify-between col-span-12">
          <span className="block text-sm">
            {label}
            {help && (
              <HoverCard>
                <HoverCardTrigger type="button">
                  <QuestionMarkCircledIcon className="inline ms-2 align-middle opacity-50" />
                </HoverCardTrigger>
                <HoverCardContent className="max-w-md w-full">
                  <article className="prose prose-sm dark:prose-invert text-muted-foreground">
                    {help}
                  </article>
                </HoverCardContent>
              </HoverCard>
            )}
          </span>
          {optional && (
            <span className="text-sm text-muted-foreground italic">
              Optional
            </span>
          )}
        </div>
        <div className="col-span-12">
          <div className="relative">{children}</div>
          {description && (
            <p className="mt-1 leading-normal text-xs opacity-50">
              {description}
            </p>
          )}
        </div>
      </label>
    </fieldset>
  );
}

export function PropertyTextInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  return (
    <input
      className="
        peer/input block box-border w-full rounded-md shadow-sm transition-all focus-visible:shadow-md outline-none focus:ring-current focus:ring-2 focus-visible:border-foreground-muted focus-visible:ring-background-control placeholder-foreground-muted bg-foreground/[.026] border border-control text-sm px-4 py-2
        dark:text-white dark:bg-black
      "
      type="text"
      {...props}
    />
  );
}

export function PanelHeader({ children }: React.PropsWithChildren<{}>) {
  return (
    <header className="relative space-y-1 py-4 px-4 bg-background sm:px-6 border-b">
      {children}
    </header>
  );
}

export function PanelHeaderTitle({ children }: React.PropsWithChildren<{}>) {
  return (
    <Dialog.Title className="text-lg font-semibold">{children}</Dialog.Title>
  );
}

export function PanelHeaderActions({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="absolute right-0 top-0 bottom-0 flex items-center space-x-2 px-4 py-4">
      {children}
    </div>
  );
}

export function PanelContent({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn("relative flex-1 overflow-y-auto", className)}>
      {children}
    </div>
  );
}

export function PanelClose({ children }: React.PropsWithChildren<{}>) {
  return <Dialog.Close asChild>{children}</Dialog.Close>;
}

export function PanelFooter({ children }: React.PropsWithChildren<{}>) {
  return (
    <footer className="flex w-full justify-end space-x-3 border-t border-default px-3 py-4">
      {children}
    </footer>
  );
}
