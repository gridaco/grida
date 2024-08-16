import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PropertyTypeIcon from "@/components/property-type-icon";

// Define the type for a property in the schema
interface Property {
  name: string;
  type: "string" | "number" | "object" | "unknown" | "this";
  properties: Property[];
  value?: any;
  expression: string[];
}

// Define the type for the schema
interface Schema {
  type: "string" | "number" | "object" | "unknown" | "this";
  properties: Property[];
}

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

// Transform data to a format partially resembling JSON Schema
const transformDataToSchema = (data: Record<string, any>): Schema => {
  const transform = (obj: Record<string, any>, path: string[] = []): Schema => {
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

// Render menu items from the transformed schema
const renderMenuItems = (
  properties: Property[],
  onSelect: (expression: string[]) => void
): React.ReactNode => {
  return properties.map((property, index) => {
    if (property.type === "object" && property.properties.length > 0) {
      return (
        <DropdownMenuSub key={index}>
          <DropdownMenuSubTrigger>
            <PropertyTypeIcon type={property.type} className="me-2 w-4 h-4" />
            {property.name}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {renderMenuItems(property.properties, onSelect)}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      );
    } else {
      return (
        <DropdownMenuItem
          key={index}
          onSelect={() => onSelect(property.expression)}
        >
          <PropertyTypeIcon type={property.type} className="me-2 w-4 h-4" />
          {property.name}
        </DropdownMenuItem>
      );
    }
  });
};

// Props for the NestedDropdownMenu component
interface NestedDropdownMenuProps {
  data: Record<string, any>;
  onSelect: (expression: string[]) => void;
  asSubmenu?: boolean;
}

// Main component to render the nested dropdown menu
export default function NestedDropdownMenu({
  data,
  asSubmenu,
  onSelect,
}: NestedDropdownMenuProps) {
  const transformedData = transformDataToSchema(data);

  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <PropertyTypeIcon
            type={transformedData.type}
            className="me-2 w-4 h-4"
          />
          Page
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {renderMenuItems(transformedData.properties, onSelect)}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        {renderMenuItems(transformedData.properties, onSelect)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
