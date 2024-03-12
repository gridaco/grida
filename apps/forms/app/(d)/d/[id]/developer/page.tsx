"use client";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import React, { useEffect, useState } from "react";
import { createClientClient } from "@/lib/supabase/client";
import {
  PanelContent,
  PanelFooter,
  PanelHeader,
  PanelPropertyField,
  PanelPropertyFields,
  PanelPropertySection,
  PanelPropertySectionTitle,
  PropertyTextInput,
  SidePanel,
} from "@/components/panels/side-panel";

interface FormFieldDefinition {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  required: boolean;
}

export default function DeveloperPage({
  params,
}: {
  params: {
    id: string;
  };
}) {
  const form_id = params.id;
  const [fields, setFields] = useState<FormFieldDefinition[]>([]);

  const is_empty = fields.length === 0;

  const supabase = createClientClient();

  useEffect(() => {
    supabase
      .from("form_field")
      .select()
      .eq("form_id", form_id)
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
        } else {
          console.log("fields", data);
          setFields(data as FormFieldDefinition[]);
        }
      });
  }, [supabase, form_id]);

  return (
    <main>
      <Panel />
      <button className="rounded p-2 bg-neutral-100">
        <PlusIcon width={24} height={24} />
      </button>

      <section className="mx-auto max-w-screen-lg">
        <div className="flex flex-col gap-2">
          {fields.map((field, i) => (
            <FormFeildEdit key={i} {...field} />
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

function Panel() {
  return (
    <SidePanel trigger={<button>Create New Field</button>}>
      <PanelHeader>New Field</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Preview</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
              <FormFieldPreview />
            </div>
          </PanelPropertyFields>
        </PanelPropertySection>
        <PanelPropertySection>
          <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField
              label={"Name"}
              description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
            >
              <PropertyTextInput placeholder={"field_name"} />
            </PanelPropertyField>
            <PanelPropertyField label={"Type"}>
              <select>
                <option value="text">Text</option>
                <option value="textarea">Textarea</option>
                <option value="email">Email</option>
                <option value="number">Number</option>
              </select>
            </PanelPropertyField>
            <PanelPropertyField label={"Required"}>
              <input type="checkbox" />
            </PanelPropertyField>

            {/* <PropertyTextField
                label={"Name"}
                placeholder={"field_name"}
                description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
              /> */}
          </PanelPropertyFields>
        </PanelPropertySection>
      </PanelContent>
      <PanelFooter>
        <button className="rounded p-2 bg-neutral-100">Cancel</button>
        <button className="rounded p-2 bg-neutral-100">Save</button>
      </PanelFooter>
    </SidePanel>
  );
}

function FormFeildEdit({
  name,
  label,
  type,
  placeholder,
  required,
}: FormFieldDefinition) {
  return (
    <table className="rounded border p-4 flex flex-col gap-4">
      <thead>
        <tr className="flex">
          <th>
            <select value={type}>
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
              defaultValue={name}
            />
          </th>
          <div className="flex-1" />
          <th className="w-80 bg-gray-50">Preview</th>
        </tr>
      </thead>
      <tbody className="flex justify-between">
        <div className="flex flex-col gap-2">
          <label>
            Label
            <input
              className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              type="text"
              placeholder="Label"
              defaultValue={label}
            />
          </label>
          <label>
            Placeholder
            <input
              className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              type="text"
              placeholder="Placeholder"
              defaultValue={placeholder}
            />
          </label>
          <label>
            Required
            <input
              // className="shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              type="checkbox"
              defaultChecked={required}
            />
          </label>
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
