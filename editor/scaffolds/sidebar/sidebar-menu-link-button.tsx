import React from "react";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import Link from "next/link";

export function SidebarMenuLinkButton({
  link,
  layout,
  children,
  isActive,
  disabled,
  ...props
}: React.ComponentProps<typeof SidebarMenuButton> & {
  link?: {
    href: string;
    target?: string;
  };
  /**
   * If true, the this is a layout link, and also stays selected when the path is a subpath of the href
   */
  layout?: boolean;
}) {
  const pathName = usePathname();

  const selected = link
    ? pathName === link.href || (layout && pathName.startsWith(link.href + "/"))
    : false;

  if (link && !disabled) {
    return (
      <SidebarMenuButton
        asChild
        isActive={selected || isActive}
        disabled={disabled}
        {...props}
      >
        <Link href={link.href} target={link.target}>
          {children}
        </Link>
      </SidebarMenuButton>
    );
  } else {
    return (
      <SidebarMenuButton isActive={isActive} disabled={disabled} {...props}>
        {children}
      </SidebarMenuButton>
    );
  }
}
