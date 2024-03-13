import { FormFieldPreview } from "@/components/formfield";
import type { FormBlock } from "../state";
import { useEditorState } from "../provider";
import { FormFieldDefinition } from "@/types";
import { InputIcon, SectionIcon } from "@radix-ui/react-icons";
import React, { useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

export function BlocksCanvas({
  children,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  const { setNodeRef } = useDroppable({
    id: "root",
  });

  return (
    <div ref={setNodeRef} {...props}>
      {children}
    </div>
  );
}

export function Block(props: React.PropsWithChildren<FormBlock>) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: props.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  function renderBlock() {
    switch (props.type) {
      case "section":
        return <SectionBlock {...props}>{props.children}</SectionBlock>;
      case "field":
        return <FieldBlock {...props} />;
    }
  }

  return (
    <>
      <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
        {renderBlock()}
      </div>
    </>
  );
}

export function FieldBlock({ id, type, form_field_id, data }: FormBlock) {
  const [state, dispatch] = useEditorState();

  const form_field: FormFieldDefinition | undefined = state.fields.find(
    (f) => f.id === form_field_id
  );

  const onFieldChange = useCallback(
    (field_id: string) => {
      dispatch({
        type: "blocks/field/change",
        field_id,
        block_id: id,
      });
    },
    [dispatch, id]
  );

  return (
    <div className="rounded-md flex flex-col gap-4 border w-full p-4">
      <div className="flex flex-row items-center gap-8">
        <span className="flex flex-row gap-2 items-center">
          <InputIcon />
          <span className="capitalize">{type}</span>
        </span>
        <select
          value={form_field_id ?? ""}
          onChange={(e) => {
            onFieldChange(e.target.value);
          }}
        >
          {state.fields.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>
      <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
        <FormFieldPreview
          readonly
          disabled={!!!form_field}
          name={form_field?.name ?? ""}
          label={form_field?.label ?? ""}
          type={form_field?.type ?? "text"}
          required={form_field?.required ?? false}
          helpText={form_field?.help_text ?? ""}
          placeholder={form_field?.placeholder ?? ""}
        />
      </div>
    </div>
  );
}

export function SectionBlock({
  children,
  ...props
}: React.PropsWithChildren<FormBlock>) {
  const { setNodeRef } = useDroppable({
    id: props.id,
  });

  return (
    <div ref={setNodeRef} className="mt-10 p-4 rounded-md border">
      <span className="flex flex-row gap-2 items-center">
        <SectionIcon />
        <span>Section</span>
      </span>
      {children}
    </div>
  );
}
