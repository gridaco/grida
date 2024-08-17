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

interface NestedMenuItem<T = any> {
  path: Path;
  id: string;
  // when resolved set to true, the menu item will not have a submenu
  resolved?: boolean;
  disabled?: boolean;
  data?: T;
}

// Props for the NestedDropdownMenu component
interface NestedDropdownMenuProps<T = any> {
  resolveMenuItems: (
    path: Path | "root",
    data?: T
  ) => NestedMenuItem<T>[] | undefined;
  renderMenuItem: (item: NestedMenuItem<T>) => React.ReactNode;
  onSelect?: (path: Path) => void;
}

const renderMenuItems = ({
  items,
  resolveMenuItems,
  renderMenuItem,
  onSelect,
}: {
  items: NestedMenuItem[];
} & NestedDropdownMenuProps): React.ReactNode => {
  return items.map((item, index) => {
    const subitems = item.resolved
      ? undefined
      : resolveMenuItems(item.path, item.data);

    if (subitems && subitems.length > 0) {
      return (
        <DropdownMenuSub key={index}>
          <DropdownMenuSubTrigger disabled={item.disabled}>
            {renderMenuItem(item)}
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
        <DropdownMenuItem
          key={index}
          onSelect={() => onSelect?.(item.path)}
          disabled={item.disabled}
        >
          {renderMenuItem(item)}
        </DropdownMenuItem>
      );
    }
  });
};

// Main component to render the nested dropdown menu
export default function NestedDropdownMenu<T>({
  asSubmenu,
  asChild,
  resolveMenuItems,
  renderMenuItem,
  onSelect,
  children,
}: React.PropsWithChildren<
  NestedDropdownMenuProps<T> & {
    asSubmenu?: boolean;
    asChild?: boolean;
  }
>) {
  const items = resolveMenuItems("root");

  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger asChild={asChild}>
          {children}
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent>
            {items &&
              renderMenuItems({
                items: items,
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
        {items &&
          renderMenuItems({
            items: items,
            resolveMenuItems,
            renderMenuItem,
            onSelect,
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
