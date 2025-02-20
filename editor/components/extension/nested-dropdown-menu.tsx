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

export interface NestedMenuItemProps<T = any> {
  name: string;
  // when resolved set to true, the menu item will not have a submenu
  resolved?: boolean;
  disabled?: boolean;
  data: T;
}

// Props for the NestedDropdownMenu component
interface NestedDropdownMenuProps<T = any> {
  resolveMenuItems: (
    path: Path | "root"
  ) => NestedMenuItemProps<T>[] | undefined;
  renderMenuItem: (path: Path, item: NestedMenuItemProps<T>) => React.ReactNode;
  onSelect?: (path: Path, item: NestedMenuItemProps<T>) => void;
}

const renderMenuItems = ({
  items,
  resolveMenuItems,
  renderMenuItem,
  onSelect,
  relpath = [],
}: NestedDropdownMenuProps & {
  items: NestedMenuItemProps[];
  relpath?: Path;
}): React.ReactNode => {
  return items.map((item, index) => {
    const itempath = [...relpath, item.name];
    const subitems = item.resolved ? undefined : resolveMenuItems(itempath);

    if (subitems && subitems.length > 0) {
      return (
        <DropdownMenuSub key={index}>
          <DropdownMenuSubTrigger disabled={item.disabled}>
            {renderMenuItem(itempath, item)}
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              {renderMenuItems({
                items: subitems,
                resolveMenuItems,
                renderMenuItem,
                onSelect,
                relpath: itempath,
              })}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      );
    } else {
      return (
        <DropdownMenuItem
          key={index}
          onSelect={() => onSelect?.(itempath, item)}
          disabled={item.disabled}
        >
          {renderMenuItem(itempath, item)}
        </DropdownMenuItem>
      );
    }
  });
};

// Main component to render the nested dropdown menu
export default function NestedDropdownMenu<T>({
  asSubmenu,
  asChild,
  disabled,
  resolveMenuItems,
  renderMenuItem,
  onSelect,
  children,
}: React.PropsWithChildren<
  NestedDropdownMenuProps<T> & {
    disabled?: boolean;
    asSubmenu?: boolean;
    asChild?: boolean;
  }
>) {
  const items = resolveMenuItems("root");

  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled} asChild={asChild}>
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
      <DropdownMenuTrigger disabled={disabled} asChild={asChild}>
        {children}
      </DropdownMenuTrigger>
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
