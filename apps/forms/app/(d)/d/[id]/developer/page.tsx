"use client";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import React, { useState } from "react";

interface FormFieldDefinition {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required: boolean;
}

export default function DeveloperPage() {
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);

  const is_empty = fields.length === 0;

  return (
    <main>
      <SidePanel />
      <button className="rounded p-2 bg-neutral-100">
        <PlusIcon width={24} height={24} />
      </button>

      <section className="mx-auto max-w-screen-lg">
        <div className="flex flex-col gap-2">
          {fields.map((field, i) => (
            <FormFeildEdit key={i} />
          ))}
        </div>
        <NewFieldButton
          variant={is_empty ? "big" : "small"}
          onClick={() => {
            setFields([
              ...fields,
              {
                name: "",
                label: "",
                type: "text",
                placeholder: "",
                required: false,
              },
            ]);
          }}
        />
      </section>
    </main>
  );
}

function FormFeildEdit() {
  return (
    <table className="rounded border p-4 flex flex-col gap-4">
      <thead>
        <tr className="flex">
          <th>
            <select>
              <option value="text">Text</option>
              <option value="textarea">Textarea</option>
              <option value="email">Email</option>
              <option value="number">Number</option>
            </select>
          </th>
          <th>
            <input
              className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              type="text"
              placeholder="Field Name"
            />
          </th>
          <div className="flex-1" />
          <th className="w-80 bg-gray-50">Preview</th>
        </tr>
      </thead>
      <tbody className="flex justify-between">
        <div className="flex flex-col gap-2">
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            type="text"
            placeholder="Label"
          />
          <input
            className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            type="text"
            placeholder="Placeholder"
          />
          <input
            // className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            type="checkbox"
          />
        </div>
        <FormFieldPreview />
      </tbody>
    </table>
  );
}

function FormFieldPreview() {
  return (
    <div className="flex flex-col">
      <label>Field Label</label>
      <input type="text" placeholder="Placeholder" />
    </div>
  );
}

function NewFieldButton({
  variant = "small",
  ...props
}: React.HtmlHTMLAttributes<HTMLButtonElement> & {
  variant?: "small" | "big";
}) {
  return (
    <button
      {...props}
      data-variant={variant}
      className="flex flex-row data-[variant='big']:flex-col items-center justify-center w-full rounded p-2 bg-neutral-100 border shadow hover:shadow-lg transition-shadow data-[variant='big']:min-h-40"
    >
      <PlusIcon width={24} height={24} />
      New Field
    </button>
  );
}

import * as Dialog from "@radix-ui/react-dialog";

function SidePanel() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button>Create New Field</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="z-40 fixed bg-neutral-500/50 h-full w-full left-0 top-0 opacity-75 data-closed:animate-fade-out-overlay-bg data-open:animate-fade-in-overlay-bg " />
        <Dialog.Content className="z-40 bg-neutral-100 flex flex-col fixed inset-y-0 lg:h-screen border-l border-overlay shadow-xl  w-screen max-w-3xl h-full  right-0 data-open:animate-panel-slide-right-out data-closed:animate-panel-slide-right-in">
          <PanelHeader>New Field</PanelHeader>
          <PanelContent>
            <PropertySection>
              <PropertySectionTitle>Preview</PropertySectionTitle>
              <PropertyFields>
                <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
                  <FormFieldPreview />
                </div>
              </PropertyFields>
            </PropertySection>
            <PropertySection>
              <PropertySectionTitle>General</PropertySectionTitle>
              <PropertyFields>
                <PropertyField
                  label={"Name"}
                  description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
                >
                  <PropertyTextInput placeholder={"field_name"} />
                </PropertyField>
                <PropertyField label={"Type"}>
                  <select>
                    <option value="text">Text</option>
                    <option value="textarea">Textarea</option>
                    <option value="email">Email</option>
                    <option value="number">Number</option>
                  </select>
                </PropertyField>
                <PropertyField label={"Required"}>
                  <input type="checkbox" />
                </PropertyField>

                {/* <PropertyTextField
                label={"Name"}
                placeholder={"field_name"}
                description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
              /> */}
              </PropertyFields>
            </PropertySection>
          </PanelContent>
          <PanelFooter>
            <button className="rounded p-2 bg-neutral-100">Cancel</button>
            <button className="rounded p-2 bg-neutral-100">Save</button>
          </PanelFooter>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PropertySection({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="grid grid-cols-12 gap-6 px-8 py-8 opacity-100">
      {children}
    </div>
  );
}

function PropertySectionTitle({ children }: React.PropsWithChildren<{}>) {
  return (
    <span className="text-foreground col-span-12 text-sm lg:col-span-5 lg:!col-span-4">
      {children}
    </span>
  );
}

function PropertyFields({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="relative col-span-12 flex flex-col gap-6 lg:!col-span-8">
      {children}
    </div>
  );
}

function PropertyField({
  label,
  description,
  optional,
  children,
}: React.PropsWithChildren<{
  label: string;
  description?: string;
  optional?: boolean;
}>) {
  return (
    <div className="text-sm grid gap-2 md:grid md:grid-cols-12">
      <div className="flex flex-row space-x-2 justify-between col-span-12">
        <label className="block text-sm">{label}</label>
        {optional && <span className="text-sm">Optional</span>}
      </div>
      <div className="col-span-12">
        <div className="relative">{children}</div>
        {description && (
          <span className="mt-2 leading-normal text-sm">{description}</span>
        )}
      </div>
    </div>
  );
}

function PropertyTextInput({ placeholder }: { placeholder?: string }) {
  return (
    <input
      className="peer/input block box-border w-full rounded-md shadow-sm transition-all focus-visible:shadow-md outline-none focus:ring-current focus:ring-2 focus-visible:border-foreground-muted focus-visible:ring-background-control placeholder-foreground-muted bg-foreground/[.026] border border-control text-sm px-4 py-2"
      type="text"
      placeholder={placeholder}
    />
  );
}

function PanelHeader({ children }: React.PropsWithChildren<{}>) {
  return (
    <header className="space-y-1 py-4 px-4 bg-neutral-100 sm:px-6 border-b">
      {children}
    </header>
  );
}

function PanelContent({ children }: React.PropsWithChildren<{}>) {
  return <div className=" relative flex-1 overflow-y-auto ">{children}</div>;
}

function PanelFooter({ children }: React.PropsWithChildren<{}>) {
  return (
    <footer className="flex w-full justify-end space-x-3 border-t border-default px-3 py-4">
      {children}
    </footer>
  );
}
