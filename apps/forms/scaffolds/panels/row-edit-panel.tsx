"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PanelClose,
  PanelContent,
  PanelFooter,
  PanelHeader,
  PanelHeaderActions,
  PanelHeaderTitle,
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
import { AvatarIcon, InfoCircledIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";
import { TVirtualRow } from "../editor/state";
import { Toggle } from "@/components/ui/toggle";
import { FormView } from "../e/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormSession, useRequestFormSession } from "../e/form/load";
import toast from "react-hot-toast";

type ResponseRow = TVirtualRow<FormResponseField, FormResponse>;

export function RowEditPanel({
  title,
  table_id,
  attributes,
  mode,
  init,
  ...props
}: React.ComponentProps<typeof SidePanel> & {
  title: string;
  table_id: string;
  attributes: FormFieldDefinition[];
  mode: "create" | "update" | "read";
  init?: Partial<{
    row: TVirtualRow<FormResponseField, FormResponse>;
  }>;
}) {
  const { row } = init ?? {};

  const [advanced, setAdvanced] = useState<boolean>(mode === "update");

  return (
    <SidePanel {...props}>
      {mode === "create" && (
        <>
          <FormViewProvider form_id={table_id}>
            <PanelHeader>
              <PanelHeaderTitle>{title}</PanelHeaderTitle>
            </PanelHeader>
            <PanelContent className=" divide-y">
              {row && advanced && (
                <>
                  <SectionResponseGeneralDetails response={row} />
                  {row.meta.customer_id && (
                    <SectionResponseCustomerDetails response={row} />
                  )}
                  <SectionResponseMetadataJson json={row.meta} />
                </>
              )}
              <EditRowForm
                onSubmit={(data) => {
                  const promise = fetch(`/submit/${table_id}`, {
                    method: "POST",
                    body: data,
                  });

                  toast.promise(promise, {
                    loading: "Saving...",
                    success: "Saved!",
                    error: "Failed to save.",
                  });

                  promise.then(() => {
                    props.onOpenChange?.(false);
                  });
                }}
              />
            </PanelContent>
            <PanelFooter>
              <PanelClose>
                <Button variant="secondary">Close</Button>
              </PanelClose>
              <FormView.Prev>Previous</FormView.Prev>
              <FormView.Next>Next</FormView.Next>
              <FormView.Submit>Save</FormView.Submit>
            </PanelFooter>
          </FormViewProvider>
        </>
      )}
      {mode === "update" && (
        <>
          <PanelHeader>
            <PanelHeaderTitle>{title}</PanelHeaderTitle>
            <PanelHeaderActions>
              <Toggle
                size="sm"
                pressed={advanced}
                onPressedChange={setAdvanced}
              >
                <InfoCircledIcon />
              </Toggle>
            </PanelHeaderActions>
          </PanelHeader>
          <PanelContent className=" divide-y">
            {row && advanced && (
              <>
                <SectionResponseGeneralDetails response={row} />
                {row.meta.customer_id && (
                  <SectionResponseCustomerDetails response={row} />
                )}
                <SectionResponseMetadataJson json={row.meta} />
              </>
            )}
            <PanelPropertySection>
              <PanelPropertySectionTitle>Response</PanelPropertySectionTitle>
              <PanelPropertyFields>
                {attributes?.map((def) => {
                  const record = row?.data?.[def.id];

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
          </PanelContent>
          <PanelFooter>
            <PanelClose>
              <Button variant="secondary">Close</Button>
            </PanelClose>
          </PanelFooter>
        </>
      )}
    </SidePanel>
  );
}

function FormViewProvider({
  form_id,
  children,
}: React.PropsWithChildren<{
  form_id: string;
}>) {
  const { session, clearSessionStorage } = useRequestFormSession(form_id);
  const {
    data: res,
    error: servererror,
    isLoading,
  } = useFormSession(form_id, {
    mode: "signed",
    session_id: session,
    // TODO: not implemented
    user_id: "",
  });

  useEffect(() => {
    return () => {
      clearSessionStorage();
    };
  }, []);

  const { data, error } = res || {};

  if (isLoading || !session || !data) {
    return (
      <main className="h-screen min-h-screen">
        <div className="p-4 overflow-auto flex-1">
          <SkeletonCard />
        </div>
      </main>
    );
  }

  const { blocks, tree, fields, default_values } = data;

  return (
    <FormView.Root
      form_id={form_id}
      session_id={session}
      fields={fields}
      defaultValues={default_values}
      blocks={blocks}
      tree={tree}
    >
      {children}
    </FormView.Root>
  );
}

function EditRowForm({ onSubmit }: { onSubmit?: (data: FormData) => void }) {
  // return <>{JSON.stringify(data)}</>;
  return (
    <div className="prose dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-hr:border-border text-foreground max-w-none">
      <FormView.Body
        onSubmit={(e) => {
          e.preventDefault();

          const formdata = new FormData(e.target as HTMLFormElement);
          onSubmit?.(formdata);
        }}
        className="max-w-full"
        config={{
          is_powered_by_branding_enabled: false,
        }}
      />
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="flex flex-col space-y-3">
      <Skeleton className="h-[24px] w-3/4 rounded-xl" />
      <Skeleton className="h-[100px] w-full rounded-xl" />
      <div className="h-10" />
      <div className="space-y-10">
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-8 w-full" />
        </div>
      </div>
    </div>
  );
}

function SectionResponseGeneralDetails({
  response,
}: {
  response: ResponseRow;
}) {
  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>General</PanelPropertySectionTitle>
      <PanelPropertyFields>
        <ResponseIdTable {...response.meta} />
        <ResponsePropertiesTable {...response.meta} />
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}

function SectionResponseCustomerDetails({
  response,
}: {
  response: ResponseRow;
}) {
  const [state, dispatch] = useEditorState();

  const onViewCustomerDetailsClick = useCallback(
    (customer_id: string) => {
      dispatch({
        type: "editor/customers/edit",
        customer_id: customer_id,
      });
    },
    [dispatch]
  );

  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>Customer</PanelPropertySectionTitle>
      <PanelPropertyFields>
        <ResponseCustomerMetaTable {...response.meta} />
        <Button
          type="button"
          onClick={() => onViewCustomerDetailsClick(response.meta.customer_id!)}
          variant="secondary"
        >
          <AvatarIcon className="me-2 inline-flex align-middle" />
          More about this customer
        </Button>
      </PanelPropertyFields>
    </PanelPropertySection>
  );
}

function SectionResponseMetadataJson({ json }: { json: Record<string, any> }) {
  const { resolvedTheme } = useTheme();

  const monaco = useMonaco();
  useMonacoTheme(monaco, resolvedTheme ?? "light");

  return (
    <PanelPropertySection>
      <PanelPropertySectionTitle>RAW</PanelPropertySectionTitle>
      <PanelPropertyFields>
        <PanelPropertyField label={"raw.json (readonly)"}>
          <Editor
            className="rounded overflow-hidden shadow-sm border"
            height={400}
            defaultLanguage="json"
            defaultValue={JSON.stringify(json, null, 2)}
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
