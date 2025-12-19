"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import { StateProvider } from "./provider";
import { useEditorState, useDatabaseTableId, useDatagridTable } from "./use";
import { reducer } from "./reducer";
import {
  SchemaDocumentEditorInit,
  EditorInit,
  FormDocumentEditorInit,
  CanvasDocumentEditorInit,
  BucketDocumentEditorInit,
  SchemaMayVaryDocument,
} from "./state";
import { initialEditorState } from "./init";
import { FieldEditPanel, FieldSave } from "../panels/field-edit-panel";
import { FormFieldDefinition } from "@/grida-forms-hosted/types";
import { FormFieldUpsert, EditorApiResponse } from "@/types/private/api";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { RowEditPanel } from "../panels/row-edit-panel";
import { CustomerEditPanel } from "../panels/customer-panel";
import { MediaViewerProvider } from "@/components/mediaviewer";
import { AssetsBackgroundsResolver } from "./resolver/assets-backgrounds-resolver";
import { toast } from "sonner";
import { EditorSymbols } from "./symbols";
import { fmt_local_index } from "@/utils/fmt";
import Multiplayer from "./multiplayer";
import { FormAgentThemeSyncProvider } from "./sync";
import { ErrorInvalidSchema } from "@/components/error";
import { editor } from "@/grida-canvas";
import { useEditor } from "@/grida-canvas-react";
import { StandaloneDocumentEditor } from "@/grida-canvas-react";
import grida from "@grida/schema";
import { createBrowserCanvasClient } from "@/lib/supabase/client";
import { CanvasDocumentSnapshotSchema } from "@/types";
import { useDebounceCallback } from "usehooks-ts";

export function EditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: EditorInit }>) {
  switch (initial.doctype) {
    case "v0_form":
      return (
        <FormDocumentEditorProvider initial={initial}>
          {children}
        </FormDocumentEditorProvider>
      );
    case "v0_schema":
      return (
        <DatabaseDocumentEditorProvider initial={initial}>
          {children}
        </DatabaseDocumentEditorProvider>
      );
    case "v0_bucket":
      return (
        <BucketDocumentEditorProvider initial={initial}>
          {children}
        </BucketDocumentEditorProvider>
      );
    case "v0_canvas": {
      return (
        <CanvasDocumentEditorProvider initial={initial}>
          {children}
        </CanvasDocumentEditorProvider>
      );
    }
    default:
      throw new Error("unsupported doctype");
  }
}

function DatabaseDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: SchemaDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );
  return (
    <StateProvider state={state} dispatch={dispatch}>
      <Multiplayer>
        <TooltipProvider>
          <AssetsBackgroundsResolver />
          <MediaViewerProvider>
            {/*  */}
            <FormFieldEditPanelProvider />
            <RowEditPanelProvider />
            {children}
          </MediaViewerProvider>
        </TooltipProvider>
      </Multiplayer>
    </StateProvider>
  );
}

function BucketDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: BucketDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );
  return (
    <StateProvider state={state} dispatch={dispatch}>
      <Multiplayer>
        <TooltipProvider>
          <AssetsBackgroundsResolver />
          <MediaViewerProvider>{children}</MediaViewerProvider>
        </TooltipProvider>
      </Multiplayer>
    </StateProvider>
  );
}

function CanvasDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: CanvasDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );

  const setSaving = useCallback(
    (saving: boolean) => dispatch({ type: "saving", saving: saving }),
    [dispatch]
  );

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <Multiplayer>
        <TooltipProvider>
          <MediaViewerProvider>
            <HostedGridaCanvasDocumentProvider
              document_id={initial.document_id}
              setSaving={setSaving}
              initial={state.documents["canvas"]}
            >
              {children}
            </HostedGridaCanvasDocumentProvider>
          </MediaViewerProvider>
        </TooltipProvider>
      </Multiplayer>
    </StateProvider>
  );
}

async function saveHostedGridaCanvasDocument(
  document_id: string,
  document: grida.program.document.Document | undefined
) {
  const client = createBrowserCanvasClient();

  return await client
    .from("canvas_document")
    .update({
      data: document
        ? ({
            __schema_version: "0.89.0-beta+20251219",
            ...document,
          } satisfies CanvasDocumentSnapshotSchema as {})
        : null,
    })
    .eq("id", document_id!);
}

function HostedGridaCanvasDocumentProvider({
  document_id,
  setSaving,
  initial,
  children,
}: React.PropsWithChildren<{
  document_id: string;
  setSaving: (saving: boolean) => void;
  initial?: SchemaMayVaryDocument<editor.state.IEditorState>;
}>) {
  if (!initial || !initial.__schema_valid) {
    return (
      <ErrorInvalidSchema
        data={{ __schema_version: initial?.__schema_version }}
      />
    );
  }

  const editor = useEditor(initial.state);

  const save = useCallback(() => {
    setSaving(true);
    const json = editor.getDocumentJson();
    return saveHostedGridaCanvasDocument(document_id, json as any).finally(
      () => {
        setSaving(false);
      }
    );
  }, [editor, document_id, setSaving]);

  const debouncedSave = useDebounceCallback(save, 1000);

  useEffect(() => {
    editor.doc.subscribeWithSelector(
      (state) => state.document,
      () => {
        // save to server (with debounce)
        debouncedSave();
      }
    );
  }, []);

  return (
    <StandaloneDocumentEditor editor={editor}>
      {children}
    </StandaloneDocumentEditor>
  );
}

export function FormDocumentEditorProvider({
  initial,
  children,
}: React.PropsWithChildren<{ initial: FormDocumentEditorInit }>) {
  const [state, dispatch] = React.useReducer(
    reducer,
    initialEditorState(initial)
  );

  return (
    <StateProvider state={state} dispatch={dispatch}>
      <FormAgentThemeSyncProvider>
        <Multiplayer>
          <TooltipProvider>
            <AssetsBackgroundsResolver />
            <MediaViewerProvider>
              <FormFieldEditPanelProvider />
              <RowEditPanelProvider />
              <CustomerPanelProvider />
              {children}
            </MediaViewerProvider>
          </TooltipProvider>
        </Multiplayer>
      </FormAgentThemeSyncProvider>
    </StateProvider>
  );
}

function useAttributes() {
  const [state] = useEditorState();
  switch (state.doctype) {
    case "v0_form":
      return state.form.fields;
    case "v0_schema": {
      const tb = state.tables.find((t) => t.id === state.datagrid_table_id);
      if (!tb) return [];
      if ("attributes" in tb) {
        return tb.attributes;
      }
    }
    default: {
      return [];
    }
  }
}

function FormFieldEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const attributes = useAttributes();

  const db_table_id = useDatabaseTableId();

  const field = useMemo(() => {
    const focusfound = attributes?.find((f) => f.id === state.field_editor.id);
    if (focusfound) return focusfound;
    return state.field_editor.data?.draft;
  }, [state.field_editor.id, attributes, state.field_editor.data?.draft]);

  const closeFieldPanel = useCallback(
    (options: { refresh: boolean }) => {
      dispatch({
        type: "editor/panels/field-edit",
        open: false,
        refresh: options.refresh,
      });
    },
    [dispatch]
  );

  const onSaveField = useCallback(
    (init: FieldSave) => {
      if (!db_table_id) return;
      const data: FormFieldUpsert = {
        ...init,
        //
        options: init.options?.length ? init.options : undefined,
        optgroups: init.optgroups?.length ? init.optgroups : undefined,
        //
        id: state.field_editor.id ?? undefined,
        form_id: db_table_id,
        data: init.data,
      };

      process.env.NODE_ENV === "development" &&
        console.log("[EDITOR] saving..", data);

      const promise = fetch(`/private/editor/${db_table_id}/fields`, {
        body: JSON.stringify(data),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })
        .then(async (res) => {
          if (!res.ok) {
            throw new Error("Failed to save field");
          }

          const { data } =
            (await res.json()) as EditorApiResponse<FormFieldDefinition>;

          if (data) {
            // else save the field
            dispatch({
              type: "editor/table/attribute/change",
              table_id: db_table_id,
              field_id: data.id,
              data: data,
            });

            // only close when successful
            closeFieldPanel({ refresh: true });
          }
        })
        .finally(() => {
          //
        });

      toast.promise(promise, {
        loading: "Saving field...",
        success: "Field saved",
        error: "Failed to save field",
      });
    },
    [closeFieldPanel, db_table_id, state.field_editor.id, dispatch]
  );

  const is_existing_field = !!field?.id;

  if (!db_table_id) return <></>;

  return (
    <>
      <FieldEditPanel
        db_table_id={db_table_id}
        key={field?.name || state.field_editor.refreshkey}
        open={state.field_editor.open}
        title={is_existing_field ? "Edit Field" : "New Field"}
        enableAI={!is_existing_field}
        mode={is_existing_field ? "edit" : "new"}
        formResetKey={state.field_editor.refreshkey}
        init={
          field
            ? {
                id: field.id,
                name: field.name,
                type: field.type,
                label: field.label ?? "",
                help_text: field.help_text ?? "",
                placeholder: field.placeholder ?? "",
                required: field.required,
                readonly: field.readonly,
                pattern: field.pattern,
                step: field.step ?? undefined,
                min: field.min ?? undefined,
                max: field.max ?? undefined,
                autocomplete: field.autocomplete,
                data: field.data,
                accept: field.accept,
                multiple: field.multiple ?? undefined,
                options: field.options,
                optgroups: field.optgroups,
                storage: field.storage,
                reference: field.reference,
                v_value: field.v_value,
                // TODO: add inventory support
                // options_inventory: undefined,
              }
            : undefined
        }
        onOpenChange={(open) => {
          dispatch({ type: "editor/panels/field-edit", open });
        }}
        onSave={onSaveField}
      />

      {children}
    </>
  );
}

/**
 * @deprecated MIGRATE
 * @returns
 */
function useRowEditorRow() {
  const [state, dispatch] = useEditorState();

  const row = useMemo(() => {
    switch (state.doctype) {
      case "v0_form":
        const response_stream =
          state.tablespace[
            EditorSymbols.Table.SYM_GRIDA_FORMS_RESPONSE_TABLE_ID
          ].stream;

        return response_stream?.find((r) => r.id === state.row_editor.id);
      default:
        return undefined;
    }
  }, [state.doctype, state.tablespace, state.row_editor.id]);

  // const focusxsupabasemaintablerow = useMemo(() => {
  //   const pk = state.x_supabase_main_table?.pk;
  //   if (!pk) return;
  //   return state.x_supabase_main_table?.rows?.find(
  //     (r) => r[pk] === state.row_editor.id // TODO: - pk
  //   );
  // }, [
  //   state.x_supabase_main_table?.rows,
  //   state.x_supabase_main_table?.pk,
  //   state.row_editor.id,
  // ]);

  return row;
}

function RowEditPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  const attributes = useAttributes();

  const row = useRowEditorRow();

  const tb = useDatagridTable();
  const table_id = useDatabaseTableId();

  if (!tb || !table_id) return <></>;

  const mode = tb.readonly
    ? ("read" as const)
    : row
      ? ("update" as const)
      : ("create" as const);

  return (
    <>
      <RowEditPanel
        key={row?.id || state.row_editor.refreshkey}
        table_id={table_id}
        mode={mode}
        open={state.row_editor.open}
        title={
          row
            ? `Response ${row.meta.local_index ? fmt_local_index(row.meta.local_index) : ""}`
            : "New"
        }
        attributes={attributes}
        init={{
          row: row,
        }}
        onOpenChange={(open) => {
          dispatch({ type: "editor/panels/record-edit", open });
        }}
      />
      {children}
    </>
  );
}

function CustomerPanelProvider({ children }: React.PropsWithChildren<{}>) {
  const [state, dispatch] = useEditorState();

  return (
    <>
      <CustomerEditPanel
        key={state.customer_editor.id}
        customer_id={state.customer_editor.id}
        open={state.customer_editor.open}
        onOpenChange={(open) => {
          dispatch({ type: "editor/panels/customer-details", open });
        }}
      />
      {children}
    </>
  );
}
