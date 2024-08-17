import React, { useMemo } from "react";
import PropertyTypeIcon from "@/components/property-type-icon";
import NestedDropdownMenu from "@/components/extension/nested-dropdown-menu";
import { accessSchema, TProperty, TSchema } from "@/lib/spock";

// Function to get the type of a value
const getType = (value: any): "string" | "number" | "object" | "unknown" => {
  if (typeof value === "object" && !Array.isArray(value)) {
    return "object";
  }
  if (typeof value === "string") {
    return "string";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "unknown";
};

type PropertyAccessExpressionMapSchema = TSchema<{
  expression: string[];
}>;

// Transform data to a format partially resembling JSON Schema
const transformDataToSchema = (
  data: Record<string, any>
): PropertyAccessExpressionMapSchema => {
  const transform = (
    obj: Record<string, any>,
    path: string[] = []
  ): PropertyAccessExpressionMapSchema => {
    const properties = Object.keys(obj).map((key: string) => {
      const value = obj[key];
      const type = getType(value);
      const expression = [...path, key];

      return {
        name: key,
        type,
        properties:
          type === "object" ? transform(value, expression).properties : [],
        value: type !== "object" ? value : undefined,
        expression,
      };
    });

    return {
      type: "object",
      expression: path,
      properties: [
        {
          name: "this",
          type: "this",
          properties: [],
          expression: path,
        },
        ...properties,
      ],
    };
  };

  return transform(data);
};

// Props for the NestedDropdownMenu component
interface PropertyAccessDropdownMenuProps {
  asSubmenu?: boolean;
  asChild?: boolean;
  data: Record<string, any>;
  onSelect?: (expression: string[]) => void;
}

// Main component to render the nested dropdown menu
export default function PropertyAccessDropdownMenu({
  data,
  asSubmenu,
  asChild,
  onSelect,
  children,
}: React.PropsWithChildren<PropertyAccessDropdownMenuProps>) {
  const schema = useMemo(() => transformDataToSchema(data), [data]);

  const property_to_menu_item = (
    property: TProperty<{ expression: string[] }>
  ) => ({
    id: property.name,
    path: property.expression,
    data: property,
    resolved: property.type === "this",
  });

  return (
    <NestedDropdownMenu
      asChild={asChild}
      asSubmenu={asSubmenu}
      onSelect={onSelect}
      resolveMenuItems={(path) => {
        if (path === "root") {
          return schema.properties?.map(property_to_menu_item);
        }

        const item = accessSchema(path, schema);
        return item?.properties?.map((prop: any) => ({
          id: prop.name,
          path: [...path, prop.name],
          data: prop,
          resolved: prop.type === "this",
        }));
      }}
      // renderMenuItem={(path) => <>{path.join(".")}</>}
      renderMenuItem={(item) => (
        <>
          <PropertyTypeIcon type={item.data.type} className="me-2 w-4 h-4" />
          {item.id}
        </>
      )}
    >
      {children}
    </NestedDropdownMenu>
  );
}
