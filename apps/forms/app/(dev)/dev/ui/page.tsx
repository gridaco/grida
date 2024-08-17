"use client";

import NestedDropdownMenu from "@/components/extension/nested-dropdown-menu";
import { Button } from "@/components/ui/button";

export default function UIDEV() {
  const data = {
    type: "object",
    properties: [
      {
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
            expression: ["Page 2"],
          },
          {
            type: "string",
            name: "Page 3",
            expression: ["Page 3"],
          },
        ],
        name: "Pages",
      },
    ],
  };

  function access(path: string[], data: any) {
    let current = data;
    let currentPath = [];

    for (let key of path) {
      if (current.type === "object" && current.properties) {
        const next = current.properties.find((prop: any) => prop.name === key);
        if (!next) return null;
        current = next;
        currentPath.push(key);
      } else {
        return null;
      }
    }

    return {
      path: currentPath,
      name: current.name,
      properties: current.properties || [],
    };
  }

  return (
    <main>
      <div className="p-20">
        <NestedDropdownMenu
          asChild
          resolveMenuItems={(path) => {
            if (path === "root") {
              return data.properties.map((item) => ({
                path: [item.name],
                identifier: item.name,
              }));
            }

            const item = access(path, data);
            return item?.properties.map((prop: any) => ({
              identifier: prop.name,
              path: [...path, prop.name],
            }));
          }}
          renderMenuItem={(path) => <>{path.join(".")}</>}
        >
          <Button>Nested Dropdown Menu</Button>
        </NestedDropdownMenu>
      </div>
    </main>
  );
}
