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
import React from "react";

type Path = string[];

interface MenuItem<T = any> {
  path: Path;
  identifier: string;
  data?: T;
}

// Props for the NestedDropdownMenu component
interface NestedDropdownMenuProps<T = any> {
  resolveMenuItems: (path: Path | "root", data?: T) => MenuItem<T>[];
  renderMenuItem: (path: Path, data?: T) => React.ReactNode;
  onSelect?: (path: Path) => void;
}

const renderMenuItems = ({
  items,
  resolveMenuItems,
  renderMenuItem,
  onSelect,
}: {
  items: MenuItem[];
} & NestedDropdownMenuProps): React.ReactNode => {
  return items.map((item, index) => {
    const subitems = resolveMenuItems(item.path, item.data);
    if (subitems?.length > 0) {
      return (
        <DropdownMenuSub key={index}>
          <DropdownMenuSubTrigger>
            {renderMenuItem(item.path, item.data)}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {renderMenuItems({
                items: subitems,
                resolveMenuItems,
                renderMenuItem,
                onSelect,
              })}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      );
    } else {
      return (
        <DropdownMenuItem key={index} onSelect={() => onSelect?.(item.path)}>
          {renderMenuItem(item.path, item.data)}
        </DropdownMenuItem>
      );
    }
  });
};

// Main component to render the nested dropdown menu
export default function NestedDropdownMenu({
  asSubmenu,
  asChild,
  resolveMenuItems,
  renderMenuItem,
  onSelect,
  children,
}: React.PropsWithChildren<
  NestedDropdownMenuProps & {
    asSubmenu?: boolean;
    asChild?: boolean;
  }
>) {
  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger asChild={asChild}>
          {children}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {renderMenuItems({
              items: resolveMenuItems("root"),
              resolveMenuItems,
              renderMenuItem,
              onSelect,
            })}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild={asChild}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent>
        {renderMenuItems({
          items: resolveMenuItems("root"),
          resolveMenuItems,
          renderMenuItem,
          onSelect,
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
