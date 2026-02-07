"use client";

import React from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";

export type FieldState = "disabled" | "off" | "on";

export type ControlledField<T> =
  | {
      state: "disabled";
      value: T;
    }
  | {
      state: "off";
      value?: T;
    }
  | {
      state: "on";
      value: T;
      onValueChange: (value: T) => void;
      disabled?: boolean;
      placeholder?: string;
    };

export type EmailTemplateAuthoringKitProps = {
  fields: {
    to: ControlledField<string>;
    replyTo: ControlledField<string>;
    subject: ControlledField<string>;
    fromName: ControlledField<string>;
    from: ControlledField<string>;
    bodyHtml: ControlledField<string>;
  };

  /**
   * Optional note shown above the composer (e.g. requirements like CIAM).
   */
  notice?: React.ReactNode;

  /**
   * Optional helper text shown below the composer.
   */
  helper?: React.ReactNode;
};

function renderRow({
  label,
  field,
}: {
  label: string;
  field: ControlledField<string>;
}) {
  if (field.state === "off") return null;

  const disabled =
    field.state === "disabled" ? true : Boolean(field.disabled);
  const placeholder = field.state === "on" ? field.placeholder : undefined;

  return (
    <InputGroup
      className="rounded-none border-0 border-b last:border-b-0"
      data-disabled={disabled}
    >
      <InputGroupAddon align="inline-start" className="opacity-50">
        {label}
      </InputGroupAddon>
      {field.state === "on" ? (
        <InputGroupInput
          disabled={disabled}
          placeholder={placeholder}
          value={field.value}
          onChange={(e) => field.onValueChange(e.target.value)}
        />
      ) : (
        <InputGroupInput value={field.value} readOnly disabled />
      )}
    </InputGroup>
  );
}

function renderBody({ field }: { field: ControlledField<string> }) {
  if (field.state === "off") return null;

  const disabled =
    field.state === "disabled" ? true : Boolean(field.disabled);
  const placeholder = field.state === "on" ? field.placeholder : undefined;

  return (
    <InputGroup className="rounded-none rounded-b-md border-0 border-t">
      {field.state === "on" ? (
        <InputGroupTextarea
          disabled={disabled}
          rows={12}
          className="min-h-64"
          placeholder={placeholder}
          value={field.value}
          onChange={(e) => field.onValueChange(e.target.value)}
        />
      ) : (
        <InputGroupTextarea
          disabled
          rows={12}
          className="min-h-64"
          value={field.value}
          readOnly
        />
      )}
    </InputGroup>
  );
}

export function EmailTemplateAuthoringKit({
  fields,
  notice,
  helper,
}: EmailTemplateAuthoringKitProps) {
  return (
    <div className="flex flex-col gap-4">
      {notice}

      <div className="rounded-md border">
        {renderRow({ label: "To:", field: fields.to })}
        {renderRow({ label: "Reply to:", field: fields.replyTo })}
        {renderRow({ label: "Subject:", field: fields.subject })}
        {renderRow({ label: "From name:", field: fields.fromName })}
        {renderRow({ label: "From:", field: fields.from })}
        {renderBody({ field: fields.bodyHtml })}
      </div>

      {helper}
    </div>
  );
}

