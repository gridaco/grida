import { FormFieldPreview } from "@/components/formfield";
import type { FormBlock } from "../state";
import { useEditorState } from "../provider";
import { FormFieldDefinition } from "@/types";
import { InputIcon } from "@radix-ui/react-icons";
import { useCallback } from "react";

export function Block(props: React.PropsWithChildren<FormBlock>) {
  switch (props.type) {
    case "section":
      return <SectionBlock {...props}>{props.children}</SectionBlock>;
    case "field":
      return <FieldBlock {...props} />;
  }

  return <></>;
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
    <div className="flex flex-col gap-4 border w-full p-4">
      <div className="flex flex-row items-center gap-8">
        <div className="flex flex-row gap-2 items-center">
          <InputIcon />
          <span className="capitalize">{type}</span>
        </div>
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

export function SectionBlock({ children }: React.PropsWithChildren<FormBlock>) {
  return (
    <div className="mt-10">
      <span>Section</span>
      {children}
    </div>
  );
}
