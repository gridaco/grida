import React, { useCallback, useMemo, useState } from "react";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { SideControlGlobal } from "./sidecontrol-global";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEditorState, useFormFields } from "@/scaffolds/editor";
import { MixIcon } from "@radix-ui/react-icons";
import { Tokens } from "@/ast";
import { FormExpression } from "@/lib/forms/expression";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { EditBinaryExpression } from "../panels/extensions/v-edit";
import { PopoverClose } from "@radix-ui/react-popover";
import { InputControl } from "./controls/input";
import { FieldSupports } from "@/k/supported_field_types";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { useG11nResource } from "../editor/use";
import { language_label_map } from "@/k/supported_languages";
import { g11nkey } from "../editor/g11n";

export function SideControlDoctypeForm() {
  const [state, dispatch] = useEditorState();

  if (state.focus_block_id) {
    return <SelectedFormBlockProperties />;
  } else {
    return <SideControlGlobal />;
  }
}

/**
 * use within the context where focus_block_id is set
 * @returns
 */
function useFocusedFormBlock() {
  const [state, dispatch] = useEditorState();

  if (!state.focus_block_id) {
    throw new Error("No block focused");
  }

  const block = useMemo(
    () => state.blocks.find((b) => b.id === state.focus_block_id)!,
    [state.blocks, state.focus_block_id]
  );

  const set_v_hidden = useCallback(
    (exp: Tokens.ShorthandBooleanBinaryExpression) => {
      dispatch({
        type: "blocks/hidden",
        block_id: block.id,
        v_hidden: exp,
      });
    },
    [block]
  );

  return [block, { set_v_hidden }] as const;
}

function useFormField(id: string) {
  const fields = useFormFields();
  return useMemo(() => fields.find((f) => f.id === id), [fields, id]);
}

function SelectedFormBlockProperties() {
  const [block] = useFocusedFormBlock();

  return (
    <div key={block?.id}>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Block</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Hidden</PropertyLineLabel>
            <PropertyV_Hidden />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {block.type === "field" && <BlockTypeField />}
      {block.type === "header" && <BlockTypeHeader />}
      {block.type === "video" && <BlockTypeVideo />}
      {/* NOT SUPPORTED */}
      {/* {block.type === "image" && <BlockTypeImage />} */}
      {/* {block.type === "html" && <BlockTypeHtml />} */}
    </div>
  );
}

/**
 * NOTE - the type string represents a id, not a scalar for this component, atm.
 * TODO: support scalar types
 */
type ConditionExpression = Tokens.ShorthandBooleanBinaryExpression;

function PropertyV_Hidden() {
  const [block, { set_v_hidden }] = useFocusedFormBlock();

  const fields = useFormFields();

  const [condition_v_hidden, set_condition_v_hidden] =
    useState<ConditionExpression>();

  const _v_hidden_set = !!block?.v_hidden;

  const onSave = (e: any) => {
    const [l, op, r] = condition_v_hidden || [];

    if (!l || !op || !r) {
      e.preventDefault();
      toast.error("Invalid Condition");
      return;
    }
    //
    const exp: Tokens.ShorthandBooleanBinaryExpression = [
      FormExpression.create_field_property_json_ref(l as string, "value"),
      op,
      r,
    ];

    set_v_hidden(exp);
  };

  return (
    <Popover>
      <PopoverTrigger>
        <div>
          <Button variant="outline" size="sm">
            <MixIcon className="me-2" />
            {_v_hidden_set ? <>Update</> : <>Set logic</>}
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent collisionPadding={16} className="w-full">
        <div className="flex gap-4">
          <Label htmlFor="phone" className="text-right">
            Block is hidden when <br />
            <code className="text-muted-foreground">block.hidden = </code>
          </Label>
          <EditBinaryExpression
            resolvedType="boolean"
            leftOptions={fields.map((f) => ({
              type: "form_field_value",
              identifier: f.id,
              label: f.name,
            }))}
            rightOptions={(left) =>
              fields
                .find((f) => f.id === left)
                ?.options?.map((o) => ({
                  type: "option_value_reference",
                  identifier: o.id,
                  label: o.label || o.value,
                }))
            }
            defaultValue={condition_v_hidden}
            onValueChange={(value) => {
              set_condition_v_hidden(value);
            }}
          />
          <PopoverClose asChild>
            <Button disabled={!condition_v_hidden} onClick={onSave}>
              Save
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
      {/* <div className="text-muted-foreground text-sm">
        {_v_hidden_set ? (
          <code>
            <pre>{JSON.stringify(block?.v_hidden, null, 2)}</pre>
          </code>
        ) : (
          "No condition set"
        )}
      </div> */}
    </Popover>
  );
}

function BlockTypeField() {
  const [state, dispatch] = useEditorState();
  const [block] = useFocusedFormBlock();
  const field = useFormField(block.form_field_id!)!;
  const is_hidden_field = field.type === "hidden";
  const { lang, lang_default } = state.document.g11n;
  const istranslationmode = lang !== lang_default;

  const label = useG11nResource(
    g11nkey("field", { id: block.form_field_id!, property: "label" })
  );

  const placeholder = useG11nResource(
    g11nkey("field", { id: block.form_field_id!, property: "placeholder" })
  );

  const helptext = useG11nResource(
    g11nkey("field", { id: block.form_field_id!, property: "help_text" })
  );

  if (is_hidden_field) return <></>;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>
          {istranslationmode ? (
            <>
              Field{" "}
              <Badge variant="outline">
                {language_label_map[lang].flag} {lang}
              </Badge>
            </>
          ) : (
            <>Field</>
          )}
        </SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Label</PropertyLineLabel>
          <InputControl
            placeholder={label.fallback}
            value={label.value ?? ""}
            onValueChange={label.change}
          />
        </PropertyLine>
        {FieldSupports.placeholder(field.type) && (
          <PropertyLine>
            <PropertyLineLabel>Placeholder</PropertyLineLabel>
            <InputControl
              placeholder={placeholder.fallback}
              value={placeholder.value ?? ""}
              onValueChange={placeholder.change}
            />
          </PropertyLine>
        )}
        <PropertyLine>
          <PropertyLineLabel>Help Text</PropertyLineLabel>
          <InputControl
            placeholder={helptext.fallback}
            value={helptext.value ?? ""}
            onValueChange={helptext.change}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function BlockTypeHeader() {
  const [state, dispatch] = useEditorState();
  const [block] = useFocusedFormBlock();
  const { lang, lang_default } = state.document.g11n;
  const istranslationmode = lang !== lang_default;

  const title = useG11nResource(
    g11nkey("block", { id: block.id, property: "title_html" })
  );

  const description = useG11nResource(
    g11nkey("block", { id: block.id, property: "description_html" })
  );

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>
          {istranslationmode ? (
            <>
              Header{" "}
              <Badge variant="outline">
                {language_label_map[lang].flag} {lang}
              </Badge>
            </>
          ) : (
            <>Header</>
          )}
        </SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Title</PropertyLineLabel>
          <InputControl
            onValueChange={title.change}
            placeholder={title.fallback}
            //  block.title_html ?? ""
            value={
              title.value
              // istranslationmode
              //   ? t(block.id + "/title_html")
              //   : block.title_html ?? ""
            }
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Description</PropertyLineLabel>
          <InputControl
            // placeholder={block.description_html ?? ""}
            // value={istranslationmode ? "" : block.description_html ?? ""}
            placeholder={description.fallback}
            value={description.value}
            onValueChange={description.change}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function BlockTypeVideo() {
  const [state, dispatch] = useEditorState();
  const [block] = useFocusedFormBlock();
  const { lang, lang_default } = state.document.g11n;
  const istranslationmode = lang !== lang_default;

  const src = useG11nResource(
    g11nkey("block", { id: block.id, property: "src" })
  );

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>
          {istranslationmode ? (
            <>
              Video{" "}
              <Badge variant="outline">
                {language_label_map[lang].flag} {lang}
              </Badge>
            </>
          ) : (
            <>Video</>
          )}
        </SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel htmlFor="src">URL</PropertyLineLabel>
          <InputControl
            id="src"
            name="src"
            type="url"
            value={src.value}
            onValueChange={src.change}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function BlockTypeImage() {
  const [state, dispatch] = useEditorState();
  const [block] = useFocusedFormBlock();
  const { lang, lang_default } = state.document.g11n;
  const istranslationmode = lang !== lang_default;

  const src = useG11nResource(
    g11nkey("block", { id: block.id, property: "src" })
  );

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>
          {istranslationmode ? (
            <>
              Image{" "}
              <Badge variant="outline">
                {language_label_map[lang].flag} {lang}
              </Badge>
            </>
          ) : (
            <>Image</>
          )}
        </SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel htmlFor="src">URL</PropertyLineLabel>
          <InputControl
            id="src"
            name="src"
            type="url"
            value={src.value}
            onValueChange={src.change}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}
