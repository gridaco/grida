import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import {
  PropertyEnum,
  PropertyInput,
  PropertyLine,
  PropertyLineLabel,
  PropertySeparator,
  PropertyTextarea,
} from "./ui";
import { Button } from "@/components/ui-editor/button";
import { CubeIcon, GearIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { UserDataControl } from "./controls/x-userdata";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCurrentEditor, useDocumentState } from "@/grida-canvas-react";
import grida from "@grida/schema";
import type cg from "@grida/cg";
import { RGB888A32FColorControl, RGBA32FColorControl } from "./controls/color";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentSceneState } from "@/grida-canvas-react/provider";

function SceneBackgroundPropertyLine() {
  const editor = useCurrentEditor();
  const { id: scene_id, backgroundColor } = useCurrentSceneState();

  return (
    <PropertyLine>
      <RGBA32FColorControl
        variant="with-opacity"
        value={backgroundColor ? backgroundColor : undefined}
        onValueChange={(color) => {
          editor.commands.changeSceneBackground(scene_id, color);
        }}
      />
    </PropertyLine>
  );
}

export function DocumentProperties({ className }: { className?: string }) {
  const editor = useCurrentEditor();
  const { document } = useDocumentState();

  const keys = Object.keys(document.properties ?? {});

  const addProperty = () => {
    editor.commands.schemaDefineProperty();
  };

  return (
    <div className={className}>
      <SidebarSection className="pb-2">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Scene</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <SceneBackgroundPropertyLine />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <hr />
      <SidebarSection className="pt-2 border-b">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Properties</SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions className="visible">
            <Button
              variant="ghost"
              size="xs"
              onClick={addProperty}
              className="size-4 p-0"
            >
              <PlusIcon />
            </Button>
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="divide-y m-0 p-0">
          {keys.map((key, i) => {
            const property = document.properties![key];
            return (
              <PropertyDefinitionBlock
                key={i}
                definition={property}
                name={key}
                onNameChange={(newName) => {
                  editor.commands.schemaRenameProperty(key, newName);
                }}
                onDefinitionChange={(value) => {
                  editor.commands.schemaUpdateProperty(key, value);
                }}
                onRemove={() => {
                  editor.commands.schemaDeleteProperty(key);
                }}
              />
            );
          })}
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function PropertyDefinitionBlock({
  name,
  definition,
  onRemove,
  onDefinitionChange,
  onNameChange,
}: {
  name?: string;
  definition: grida.program.schema.PropertyDefinition;
  onDefinitionChange?: (value: grida.program.schema.PropertyDefinition) => void;
  onNameChange?: (value: string) => void;
  onRemove?: () => void;
}) {
  const { type, default: defaultValue } = definition;

  const setName = (value: string) => {
    onNameChange?.(value);
  };

  const onDefinitionLineChange = (key: string, value: string) => {
    onDefinitionChange?.({ ...definition, [key]: value });
  };

  // following json schema + userdata
  // - type: "string"
  // - name: string
  // - default: string
  // - required: boolean
  // - description: string
  // - format: string
  // - pattern: string
  // - minLength: number
  // - maxLength: number
  // [extra]
  // - placeholder: string
  // - userdata: object

  return (
    <Collapsible className="mt-2">
      <CollapsibleTrigger className="w-full">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span className="overflow-hidden text-ellipsis w-full">
              <CubeIcon className="me-1.5 inline align-middle" />
              {name ? name : "New Property"}
            </span>
            {type && (
              <>
                <br />
                <div className="text-xs text-workbench-accent-orange font-mono">
                  {type}
                </div>
              </>
            )}
          </SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions className="gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="size-4 p-0">
                  <GearIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <SidebarSection>
                  <SidebarSectionHeaderItem>
                    <SidebarSectionHeaderLabel>Extra</SidebarSectionHeaderLabel>
                  </SidebarSectionHeaderItem>
                  <SidebarMenuSectionContent className="space-y-2">
                    <PropertyLine>
                      {/* TODO: */}
                      <UserDataControl node_id="..." value={undefined} />
                    </PropertyLine>
                  </SidebarMenuSectionContent>
                </SidebarSection>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="xs"
              className="size-4 p-0"
              onClick={(e) => {
                e.stopPropagation();
                onRemove?.();
              }}
            >
              <TrashIcon />
            </Button>
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2">
        <SidebarSection className="border-b pb-4 space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Type *</PropertyLineLabel>
            <PropertyEnum
              value={type}
              onValueChange={(v) => {
                onDefinitionLineChange("type", v);
                onDefinitionChange?.({
                  ...definition,
                  type: v,
                  default: (initial_values as any)[v],
                } as grida.program.schema.PropertyDefinition);
              }}
              enum={["string", "number", "boolean", "image", "rgba"]}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Name *</PropertyLineLabel>
            <PropertyInput
              required
              autoFocus
              value={name}
              pattern="^[a-zA-Z_$][a-zA-Z0-9_$]*$"
              onChange={(e) => setName(e.target.value)}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Description</PropertyLineLabel>
            <PropertyInput />
          </PropertyLine>
          <PropertyLine className="flex items-center">
            <PropertyLineLabel>Required</PropertyLineLabel>
            <Checkbox defaultChecked />
          </PropertyLine>
          <PropertySeparator />
          <PropertyLine className="grid w-full">
            <PropertyLineLabel>Default</PropertyLineLabel>
            <div className="w-full">
              <PropertyDefinitionValueInput
                definition={definition}
                value={defaultValue}
                onValueChange={(value) => {
                  onDefinitionLineChange("default", value);
                }}
                placeholder="Enter Default Value"
              />
            </div>
          </PropertyLine>
        </SidebarSection>
        <SidebarSection
          hidden={type !== "string"}
          className="border-b pb-4 m-0"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Length</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Min Length</PropertyLineLabel>
              <PropertyInput type="number" min={0} placeholder="0" />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Max Length</PropertyLineLabel>
              <PropertyInput type="number" min={0} placeholder="♾️" />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection
          hidden={type !== "number"}
          className="border-b pb-4 m-0"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Range</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Minimum</PropertyLineLabel>
              <PropertyInput type="number" placeholder="minimum" />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Maximum</PropertyLineLabel>
              <PropertyInput type="number" placeholder="maximum" />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      </CollapsibleContent>
    </Collapsible>
  );
}

const initial_values = {
  string: "",
  number: 0,
  boolean: false,
  rgba: { type: "rgba", r: 0, g: 0, b: 0, a: 1 },
  object: {
    type: "object",
    properties: {},
  },
} as const;

function PropertyDefinitionValueInput<T = unknown>({
  definition,
  value,
  onValueChange,
  placeholder,
}: {
  definition: grida.program.schema.PropertyDefinition;
  value: T;
  onValueChange: (value: T) => void;
  placeholder?: string;
}) {
  switch (definition.type) {
    case "string":
      return (
        <PropertyTextarea
          value={value as string}
          onChange={(e) => {
            onValueChange(e.target.value as T);
          }}
          placeholder={placeholder}
        />
      );
    case "number":
      return (
        <PropertyInput
          type="number"
          value={value as number}
          onChange={(e) => onValueChange(e.target.value as unknown as T)}
          placeholder={placeholder}
        />
      );
    case "boolean":
      return (
        <PropertyEnum<"true" | "false">
          value={(value as boolean).toString() as "true" | "false"}
          placeholder={placeholder}
          onValueChange={(v) => {
            v === "true"
              ? onValueChange(true as unknown as T)
              : onValueChange(false as unknown as T);
          }}
          enum={[
            {
              label: "true",
              value: "true",
            },
            {
              label: "false",
              value: "false",
            },
          ]}
        />
      );
    case "rgba":
      return (
        <RGB888A32FColorControl
          value={value as cg.RGB888A32F}
          onValueChange={(v) => onValueChange(v as unknown as T)}
        />
      );
    //
  }
}
