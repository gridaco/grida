"use client";

import NestedDropdownMenu, {
  NestedMenuItemProps,
} from "@/components/extension/nested-dropdown-menu";
import { Button } from "@/components/ui/button";
import { accessSchema, TProperty, TSchema } from "@/lib/spock";
import PropertyAccessDropdownMenu from "@/scaffolds/sidecontrol/controls/context/variable";

const schema: TSchema = {
  type: "object",
  properties: {
    dev: {
      type: "object",
      properties: {
        page_1: {
          type: "object",
          properties: {
            title: {
              type: "string",
            },
            content: {
              type: "string",
            },
          },
        },
        page_2: {
          type: "object",
        },
        page_3: {
          type: "object",
        },
        reference: {
          $ref: "#/dev/page_1",
        },
      },
    },
  },
};

const property_to_menu_item = (
  name: string,
  property: TProperty
): NestedMenuItemProps =>
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

export default function UIDEV() {
  return (
    <main>
      <div className="p-20">
        <NestedDropdownMenu
          asChild
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
          renderMenuItem={(path, item) => <>{path.join(".")}</>}
        >
          <Button>Nested Dropdown Menu</Button>
        </NestedDropdownMenu>
      </div>
      <div className="p-20">
        <PropertyAccessDropdownMenu schema={schema} asChild>
          <Button>Property Access Dropdown Menu</Button>
        </PropertyAccessDropdownMenu>
      </div>
    </main>
  );
}
