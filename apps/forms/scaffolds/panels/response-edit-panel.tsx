"use client";

import React, { useCallback, useMemo } from "react";
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
import {
  FormFieldDefinition,
  FormResponse,
  FormFieldInit,
  FormResponseField,
} from "@/types";
import { Editor, useMonaco } from "@monaco-editor/react";
import { fmt_local_index } from "@/utils/fmt";
import { useTheme } from "next-themes";
import { useMonacoTheme } from "@/components/monaco";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UAParser } from "ua-parser-js";
import { AvatarIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";

export function RowEditPanel({
  onSave,
  init,
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  init?: Partial<{
    response: FormResponse;
    response_fields: FormResponseField[];
    field_defs: FormFieldDefinition[];
  }>;
  onSave?: (field: FormFieldInit) => void;
}) {
  const [state, dispatch] = useEditorState();
  const { response, response_fields, field_defs } = init ?? {};

  const { resolvedTheme } = useTheme();

  const monaco = useMonaco();
  useMonacoTheme(monaco, resolvedTheme ?? "light");

  const onSaveClick = () => {};

  const onViewCustomerDetailsClick = useCallback(
    (customer_id: string) => {
      dispatch({
        type: "editor/customers/edit",
        customer_id: customer_id,
      });
    },
    [dispatch]
  );

  if (!response) return <></>;

  return (
    <SidePanel {...props}>
      <PanelHeader>{`Response ${init?.response?.local_index ? fmt_local_index(init.response?.local_index) : ""}`}</PanelHeader>
      <PanelContent>
        <PanelPropertySection>
          <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
          <PanelPropertyFields>
            {response && (
              <>
                <ResponseIdTable {...response} />
                <ResponsePropertiesTable {...response} />
              </>
            )}
          </PanelPropertyFields>
        </PanelPropertySection>
        <PanelPropertySection>
          <PanelPropertySectionTitle>Customer</PanelPropertySectionTitle>
          <PanelPropertyFields>
            {response.customer_id && (
              <>
                <ResponseCustomerMetaTable {...response} />
                <Button
                  type="button"
                  onClick={() =>
                    onViewCustomerDetailsClick(response.customer_id!)
                  }
                  variant="secondary"
                >
                  <AvatarIcon className="me-2 inline-flex align-middle" />
                  More about this customer
                </Button>
              </>
            )}
          </PanelPropertyFields>
        </PanelPropertySection>
        <form>
          <PanelPropertySection>
            <PanelPropertySectionTitle>Response</PanelPropertySectionTitle>
            <PanelPropertyFields>
              {field_defs?.map((def) => {
                const record = response_fields?.find(
                  (f) => f.form_field_id === def.id
                );

                const txt = record?.value ?? "";

                return (
                  <PanelPropertyField key={def.id} label={def.name}>
                    <PropertyTextInput
                      autoFocus={false}
                      readOnly
                      placeholder={def.placeholder ?? ""}
                      value={txt}
                    />
                  </PanelPropertyField>
                );
              })}
            </PanelPropertyFields>
          </PanelPropertySection>
        </form>
        <PanelPropertySection>
          <PanelPropertySectionTitle>RAW</PanelPropertySectionTitle>
          <PanelPropertyFields>
            <PanelPropertyField label={"raw.json (readonly)"}>
              <Editor
                className="rounded overflow-hidden shadow-sm border"
                height={400}
                defaultLanguage="json"
                defaultValue={JSON.stringify(response, null, 2)}
                options={{
                  readOnly: true,
                  padding: {
                    top: 10,
                  },
                  minimap: {
                    enabled: false,
                  },
                  tabSize: 2,
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  glyphMargin: false,
                }}
              />
            </PanelPropertyField>
          </PanelPropertyFields>
        </PanelPropertySection>
      </PanelContent>
      <PanelFooter>
        <PanelClose>
          <Button variant="secondary">Close</Button>
        </PanelClose>
        {/* <button onClick={onSaveClick} className="rounded p-2 bg-neutral-100">
          Save
        </button> */}
      </PanelFooter>
    </SidePanel>
  );
}

function ResponseCustomerMetaTable({
  customer_id,
  platform_powered_by,
  x_ipinfo,
  x_useragent,
}: Pick<
  FormResponse,
  "x_useragent" | "customer_id" | "platform_powered_by" | "x_ipinfo"
>) {
  const ua = useMemo(() => {
    return x_useragent ? new UAParser(x_useragent).getResult() : undefined;
  }, []);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Property</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="font-mono prose prose-sm dark:prose-invert prose-pre:my-1">
        <TableRow>
          <TableCell>
            <code>id</code>
          </TableCell>
          <TableCell>
            <pre>{customer_id}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>client</code>
          </TableCell>
          <TableCell>
            <pre>{platform_powered_by}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>browser</code>
          </TableCell>
          <TableCell>
            <pre>{ua?.browser.name}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>device</code>
          </TableCell>
          <TableCell>
            <pre>
              {ua?.device.vendor} / {ua?.device.model}
            </pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>os</code>
          </TableCell>
          <TableCell>
            <pre>
              {ua?.os.name} / {ua?.os.version}
            </pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>location</code>
          </TableCell>
          <TableCell>
            <pre>
              {x_ipinfo?.country} / {x_ipinfo?.city}
            </pre>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

function ResponsePropertiesTable({
  form_id,
  created_at,
}: Pick<FormResponse, "created_at" | "form_id">) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Property</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="font-mono prose prose-sm dark:prose-invert prose-pre:my-1">
        <TableRow>
          <TableCell>
            <code>form_id</code>
          </TableCell>
          <TableCell>
            <pre>{form_id}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>created_at</code>
          </TableCell>
          <TableCell>
            <pre>{created_at}</pre>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
function ResponseIdTable({
  id,
  local_id,
  local_index,
}: Pick<FormResponse, "id" | "local_id" | "local_index">) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px]">Identifier</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="font-mono prose prose-sm dark:prose-invert prose-pre:my-1">
        <TableRow>
          <TableCell>
            <code>idx</code>
          </TableCell>
          <TableCell>
            <pre>{fmt_local_index(local_index ?? NaN)}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>id</code>
          </TableCell>
          <TableCell>
            <pre>{id}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>local_id</code>
          </TableCell>
          <TableCell>
            <pre>{local_id ?? ""}</pre>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <code>local_index</code>
          </TableCell>
          <TableCell>
            <pre>{local_index}</pre>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
