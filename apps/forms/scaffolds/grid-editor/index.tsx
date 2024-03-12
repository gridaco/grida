"use client";

import React, { useState } from "react";
import { Grid } from "../grid";
import {
  PanelClose,
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
import { FormFieldPreview } from "@/components/formfield";
import { FormFieldType } from "@/types";
import { capitalCase, snakeCase } from "change-case";
import { createClientClient } from "@/lib/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogOverlay,
} from "@editor-ui/alert-dialog";
import toast from "react-hot-toast";

type NewFieldInit = {
  name: string;
  label: string;
  placeholder: string;
  helpText: string;
  type: FormFieldType;
  required: boolean;
};

export function GridEditor({
  form_id,
  ...props
}: React.ComponentProps<typeof Grid> & {
  form_id: string;
}) {
  const [newFieldPanelOpen, setNewFieldPanelOpen] = useState(false);
  const [newFieldPanelRefreshKey, setNewFieldPanelRefreshKey] = useState(0);
  const [deleteFieldConfirmOpen, setDeleteFieldConfirmOpen] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const openNewFieldPanel = () => {
    setNewFieldPanelRefreshKey((k) => k + 1);
    setNewFieldPanelOpen(true);
  };

  const closeNewFieldPanel = (options: { refresh: boolean }) => {
    setNewFieldPanelOpen(false);
    if (options.refresh) {
      setNewFieldPanelRefreshKey((k) => k + 1);
    }
  };

  const openDeleteFieldConfirm = () => {
    setDeleteFieldConfirmOpen(true);
  };

  const closeDeleteFieldConfirm = () => {
    setDeleteFieldConfirmOpen(false);
  };

  const supabase = createClientClient();

  const onAddNewField = (init: NewFieldInit) => {
    supabase
      .from("form_field")
      .insert({
        form_id: form_id,
        type: init.type,
        name: init.name,
        label: init.label,
        placeholder: init.placeholder,
        help_text: init.helpText,
        required: init.required,
      })
      .select()
      .single()
      .then(({ data, error }) => {
        if (data) {
          toast.success("New field added");
          closeNewFieldPanel({ refresh: true });
        } else {
          if (error.code === "23505") {
            toast.error(`field with name "${init.name}" already exists`);
            console.error(error);
            return;
          }
          toast.error("Failed to add new field");
          console.error(error);
        }
      });
  };

  return (
    <>
      <DeleteFieldConfirmDialog
        open={deleteFieldConfirmOpen}
        onOpenChange={setDeleteFieldConfirmOpen}
        onCancel={closeDeleteFieldConfirm}
        onDeleteConfirm={() => {
          console.log("delete confirm");
        }}
      />
      <FieldEditPanel
        title={focusedField ? "Edit Field" : "Add New Field"}
        open={newFieldPanelOpen}
        onOpenChange={setNewFieldPanelOpen}
        formResetKey={newFieldPanelRefreshKey}
        onSubmit={onAddNewField}
      />
      <Grid
        columns={props.columns}
        rows={props.rows}
        onAddNewFieldClick={openNewFieldPanel}
        onEditFieldClick={(field_id) => {
          setFocusedField(field_id);
          openNewFieldPanel();
        }}
        onDeleteFieldClick={openDeleteFieldConfirm}
      />
    </>
  );
}

function DeleteFieldConfirmDialog({
  onCancel,
  onDeleteConfirm,
  ...props
}: React.ComponentProps<typeof AlertDialog> & {
  onCancel: () => void;
  onDeleteConfirm: () => void;
}) {
  return (
    <AlertDialog {...props}>
      {/* <AlertDialogOverlay /> */}
      <AlertDialogContent>
        <AlertDialogTitle>Delete Field</AlertDialogTitle>
        <AlertDialogDescription>
          Deleting this field will remove all data associated with it. Are you
          sure you want to delete this field?
        </AlertDialogDescription>
        <div className="flex justify-end gap-2 p-2">
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onDeleteConfirm}>
            Delete
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function FieldEditPanel({
  title,
  onSubmit,
  formResetKey = 0,
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  title?: string;
  formResetKey?: number;
  onSubmit?: (field: NewFieldInit) => void;
}) {
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [helpText, setHelpText] = useState("");
  const [type, setType] = useState<FormFieldType>("text");
  const [required, setRequired] = useState(false);

  const preview_label = buildPreviewLabel({
    name,
    label,
    required,
  });

  const preview_placeholder =
    placeholder || convertToPlainText(label) || convertToPlainText(name);

  const onSaveClick = () => {
    onSubmit?.({
      name,
      label,
      placeholder,
      helpText,
      type,
      required,
    });
  };

  return (
    <SidePanel {...props}>
      <PanelHeader>{title}</PanelHeader>
      <PanelContent>
        <form key={formResetKey}>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Preview</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
                <FormFieldPreview
                  name={name}
                  type={type}
                  label={preview_label}
                  labelCapitalize={!!label}
                  placeholder={preview_placeholder}
                  helpText={helpText}
                  required={required}
                />
              </div>
            </PanelPropertyFields>
          </PanelPropertySection>
          <PanelPropertySection>
            <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
            <PanelPropertyFields>
              <PanelPropertyField label={"Type"}>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as FormFieldType)}
                >
                  <option value="text">Text</option>
                  <option value="textarea">Textarea</option>
                  <option value="email">Email</option>
                  <option value="number">Number</option>
                </select>
              </PanelPropertyField>
              <PanelPropertyField
                label={"Name"}
                description="The input's name, identifier. Recommended to use lowercase and use an underscore to separate words e.g. column_name"
              >
                <PropertyTextInput
                  required
                  autoFocus
                  placeholder={"field_name"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </PanelPropertyField>
              <PanelPropertyField
                label={"Label"}
                description="The label that will be displayed to the user"
              >
                <PropertyTextInput
                  placeholder={"Label Text"}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </PanelPropertyField>
              <PanelPropertyField
                label={"Placeholder"}
                description="The placeholder text that will be displayed in the input when it's empty."
              >
                <PropertyTextInput
                  placeholder={"Placeholder Text"}
                  value={placeholder}
                  onChange={(e) => setPlaceholder(e.target.value)}
                />
              </PanelPropertyField>
              <PanelPropertyField
                label={"Help Text"}
                description="A small hint that will be displayed next to the input to help the user understand what to input."
              >
                <PropertyTextInput
                  placeholder={"Help Text"}
                  value={helpText}
                  onChange={(e) => setHelpText(e.target.value)}
                />
              </PanelPropertyField>
              <PanelPropertyField label={"Required"}>
                <input
                  type="checkbox"
                  checked={required}
                  onChange={(e) => setRequired(e.target.checked)}
                />
              </PanelPropertyField>

              {/* <PropertyTextField
                label={"Name"}
                placeholder={"field_name"}
                description="Recommended to use lowercase and use an underscore to separate words e.g. column_name"
              /> */}
            </PanelPropertyFields>
          </PanelPropertySection>
        </form>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <button className="rounded p-2 bg-neutral-100">Cancel</button>
        </PanelClose>
        <button onClick={onSaveClick} className="rounded p-2 bg-neutral-100">
          Save
        </button>
      </PanelFooter>
    </SidePanel>
  );
}

function buildPreviewLabel({
  name,
  label,
  required,
}: {
  name: string;
  label?: string;
  required?: boolean;
}) {
  let txt = label || convertToPlainText(name);
  if (required) {
    txt += " *";
  }
  return txt;
}

function convertToPlainText(input: string) {
  // Converts to snake_case then replaces underscores with spaces and capitalizes words
  return capitalCase(snakeCase(input)).toLowerCase();
}
