"use client";

import NestedDropdownMenu from "@/components/extension/nested-dropdown-menu";
import { Button } from "@/components/ui/button";
import { accessSchema, TSchema } from "@/lib/spock";
import PropertyAccessDropdownMenu from "@/scaffolds/sidecontrol/controls/context/variable";

const data: TSchema = {
  type: "object",
  properties: [
    {
      name: "dev",
      type: "object",
      properties: [
        {
          type: "string",
          name: "Page 1",
          properties: [
            {
              type: "string",
              name: "Title",
            },
            {
              type: "string",
              name: "Content",
            },
          ],
        },
        {
          type: "string",
          name: "Page 2",
        },
        {
          type: "string",
          name: "Page 3",
        },
      ],
    },
  ],
};

export default function UIDEV() {
  return (
    <main>
      <div className="p-20">
        <NestedDropdownMenu
          asChild
          resolveMenuItems={(path) => {
            if (path === "root") {
              return data.properties?.map((item) => ({
                path: [item.name],
                id: item.name,
              }));
            }

            const item = accessSchema(path, data);
            return item?.properties?.map((prop: any) => ({
              id: prop.name,
              path: [...path, prop.name],
            }));
          }}
          renderMenuItem={(item) => <>{item.path.join(".")}</>}
        >
          <Button>Nested Dropdown Menu</Button>
        </NestedDropdownMenu>
      </div>
      <div className="p-20">
        <PropertyAccessDropdownMenu
          data={{ a: "", b: { c: { d: "" } } }}
          asChild
        >
          <Button>Property Access Dropdown Menu</Button>
        </PropertyAccessDropdownMenu>
      </div>
    </main>
  );
}
