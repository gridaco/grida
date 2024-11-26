import { useState } from "react";
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
import { CubeIcon, PlusIcon, TrashIcon } from "@radix-ui/react-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { UserDataControl } from "./controls/x-userdata";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function __TMP_ComponentProperties() {
  const [properties, setProperties] = useState<any[]>([]);

  const addProperty = () => {
    setProperties([...properties, {}]);
  };

  return (
    <div className="mt-4 mb-10">
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Properties</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <Button
              variant="outline"
              size="xs"
              className="w-full"
              onClick={addProperty}
            >
              <PlusIcon className="me-2" /> Add Property
            </Button>
          </PropertyLine>
          {/* <PropsControl
              properties={properties}
              props={computed.props || {}}
              onValueChange={selectedNode.value}
              /> */}
        </SidebarMenuSectionContent>
      </SidebarSection>
      <div className="divide-y">
        {properties.map((property, i) => (
          <NewPropertyString
            key={i}
            onRemove={() => {
              setProperties(properties.filter((_, index) => index !== i));
            }}
          />
        ))}
      </div>
      {properties.length > 0 && (
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

function NewPropertyString({ onRemove }: { onRemove?: () => void }) {
  // following json schema + userdata
  const [type, setType] = useState<string>("string");
  const [name, setName] = useState<string>("");

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
    <Collapsible defaultOpen>
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
            <SidebarSectionHeaderActions>
              <Button
                variant="ghost"
                size="xs"
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
                onValueChange={setType}
                enum={["string", "number", "boolean", "image", "color"]}
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
            <PropertyLine className="grid">
              <PropertyLineLabel>Default</PropertyLineLabel>
              <PropertyTextarea placeholder="Enter Default Value" />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection className="border-b pb-4">
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
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Extra</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <UserDataControl
                node_id="..."
                value={undefined}
                // onValueCommit={selectedNode.userdata}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      </CollapsibleContent>
    </Collapsible>
  );
}
