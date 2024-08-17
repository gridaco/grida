import React, { useMemo } from "react";
import PropertyTypeIcon from "@/components/property-type-icon";
import NestedDropdownMenu from "@/components/extension/nested-dropdown-menu";
import { accessSchema, TProperty, TSchema } from "@/lib/spock";

// Props for the NestedDropdownMenu component
interface PropertyAccessDropdownMenuProps<T extends object> {
  asSubmenu?: boolean;
  asChild?: boolean;
  schema?: TSchema<T>;
  onSelect?: (expression: string[]) => void;
}

// Main component to render the nested dropdown menu
export default function PropertyAccessDropdownMenu<T extends object>({
  schema,
  asSubmenu,
  asChild,
  onSelect,
  children,
}: React.PropsWithChildren<PropertyAccessDropdownMenuProps<T>>) {
  const property_to_menu_item = (name: string, property: TProperty) =>
    "$ref" in property
      ? {
          name: name,
          data: property,
          resolved: true,
        }
      : {
          name: name,
          data: property,
        };

  return (
    <NestedDropdownMenu<TProperty>
      asChild={asChild}
      asSubmenu={asSubmenu}
      onSelect={onSelect}
      disabled={!schema}
      resolveMenuItems={(path) => {
        if (!schema) return undefined;
        if (!schema.properties) return undefined;

        if (path === "root") {
          return Object.keys(schema.properties).map((key) => {
            const property = schema.properties![key];
            return property_to_menu_item(key, property);
          });
        }

        const item = accessSchema(path, schema);

        if (!item) return undefined;
        if (!("properties" in item)) return undefined;
        if (!item.properties) return undefined;
        return Object.keys(item.properties).map((key) => {
          const property = item.properties![key];
          return property_to_menu_item(key, property);
        });
      }}
      // renderMenuItem={(path) => <>{path.join(".")}</>}
      renderMenuItem={(path, item) => (
        <>
          <PropertyTypeIcon
            type={"type" in item.data ? item.data.type : "$ref"}
            className="me-2 w-4 h-4"
          />
          {item.name}
        </>
      )}
    >
      {children}
    </NestedDropdownMenu>
  );
}
