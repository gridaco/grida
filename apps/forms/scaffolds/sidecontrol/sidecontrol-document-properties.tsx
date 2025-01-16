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
import { Button } from "@/components/ui/button";
import { CubeIcon, GearIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { UserDataControl } from "./controls/x-userdata";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useDocument, useNode } from "@/grida-react-canvas";
import { grida } from "@/grida";
import { RGBAColorControl } from "./controls/color";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function DocumentBackgroundPropertyLine() {
  const { background, setBackground } = useDocument();

  return (
    <PropertyLine>
      <RGBAColorControl
        value={background ? background : undefined}
        onValueChange={(color) => {
          setBackground(color);
        }}
      />
    </PropertyLine>
  );
}

export function DocumentProperties({ className }: { className?: string }) {
  const {
    state: {
      document: { properties },
    },
    schemaDefineProperty,
    schemaRenameProperty,
    schemaDeleteProperty,
    schemaUpdateProperty,
  } = useDocument();

  const keys = Object.keys(properties ?? {});
  // const [properties, setProperties] = useState<any[]>([]);

  const addProperty = () => {
    schemaDefineProperty();
  };

  return (
    <div className={className}>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Document</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <DocumentBackgroundPropertyLine />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <hr />
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Properties</SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions className="visible">
            <Button
              variant="ghost"
              size="xs"
              onClick={addProperty}
              className="w-4 h-4 p-0"
            >
              <PlusIcon />
            </Button>
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
      </SidebarSection>
      <div className="divide-y">
        {keys.map((key, i) => {
          const property = properties![key];
          return (
            <PropertyDefinitionBlock
              key={i}
              definition={property}
              name={key}
              onNameChange={(newName) => {
                schemaRenameProperty(key, newName);
              }}
              onDefinitionChange={(value) => {
                schemaUpdateProperty(key, value);
              }}
              onRemove={() => {
                schemaDeleteProperty(key);
              }}
            />
          );
        })}
        {/* {properties?.map((property, i) => (
          <NewPropertyString
            key={i}
            onRemove={() => {
              setProperties(properties.filter((_, index) => index !== i));
            }}
          />
        ))} */}
      </div>
      {keys.length > 0 && (
        <>
          <hr />
          <SidebarSection className="flex justify-end items-center gap-2 py-4">
            <Button variant="outline" size="sm">
              Cancel
            </Button>
            <Button size="sm">Save</Button>
          </SidebarSection>
        </>
      )}
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
    <Collapsible>
      <SidebarSection className="mt-2">
        <CollapsibleTrigger className="w-full">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span className="overflow-hidden text-ellipsis w-full">
                <CubeIcon className="me-1.5 inline align-middle" />
                {name ? name : "New Property"} (Draft)
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
                  <Button variant="ghost" size="xs" className="w-4 h-4 p-0">
                    <GearIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <SidebarSection>
                    <SidebarSectionHeaderItem>
                      <SidebarSectionHeaderLabel>
                        Extra
                      </SidebarSectionHeaderLabel>
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
                className="w-4 h-4 p-0"
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
      </SidebarSection>
      <CollapsibleContent>
        <SidebarSection className="border-b pb-4">
          <SidebarMenuSectionContent className="space-y-2">
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
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection hidden={type !== "string"} className="border-b pb-4">
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
        <SidebarSection hidden={type !== "number"} className="border-b pb-4">
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
        <RGBAColorControl
          value={value as grida.program.cg.RGBA8888}
          onValueChange={(v) => onValueChange(v as unknown as T)}
        />
      );
    //
  }
}
