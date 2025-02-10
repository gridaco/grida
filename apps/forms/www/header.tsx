"use client";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { cn } from "@/utils";
import React from "react";
import { GridaLogo } from "@/components/grida-logo";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const features: { title: string; href: string; description: string }[] = [
  {
    title: "Canvas",
    href: "/canvas",
    description:
      "A modal dialog that interrupts the user with important content and expects a response.",
  },
  {
    title: "Forms",
    href: "/forms",
    description:
      "For sighted users to preview content available behind a link.",
  },
  {
    title: "CMS",
    href: "/cms",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
  },
  {
    title: "Figma CI",
    href: "/figma",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
  },
];

const resources: { title: string; href: string }[] = [
  {
    title: "Docs",
    href: "/docs",
  },
  {
    title: "The Bundle",
    href: "/bundle",
  },
  {
    title: "Join Slack",
    href: "/pricing",
  },
];

export default function Header() {
  return (
    <div className="absolute top-0 left-0 right-0 z-50">
      <header className="container mx-auto flex justify-between items-center py-4 px-4 lg:py-8 lg:px-24">
        <div className="flex">
          <Link href="/" className="flex items-center justify-center gap-2">
            <GridaLogo className="w-5 h-5" />
            <span className="text-lg font-bold">Grida</span>
          </Link>
        </div>
        <div className="flex gap-4 lg:gap-12 items-center">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="font-normal">
                  Features
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="flex flex-col w-[300px] gap-3 p-4 lg:w-[400px] ">
                    {features.map((component) => (
                      <ListItem
                        key={component.title}
                        title={component.title}
                        href={component.href}
                      >
                        {component.description}
                      </ListItem>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="font-normal">
                  Resources
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="flex flex-col w-[300px] gap-3 p-4 lg:w-[400px] ">
                    {resources.map((component) => (
                      <ListItem
                        key={component.title}
                        title={component.title}
                        href={component.href}
                      />
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link href="/pricing" legacyBehavior passHref>
                  <NavigationMenuLink
                    className={`${navigationMenuTriggerStyle()}`}
                  >
                    <p className="font-normal">Pricing </p>
                  </NavigationMenuLink>
                </Link>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <Link
                  href="https://github.com/gridaco/grida/tree/main/apps/forms"
                  target="_blank"
                >
                  <Button variant="ghost" size="icon">
                    <GitHubLogoIcon className="text-foreground w-5 h-5" />
                  </Button>
                </Link>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex gap-2">
            <Link href="/sign-in" className="hidden md:block">
              <Button variant="ghost">Sign in</Button>
            </Link>
            <Link href="/dashboard/new?plan=free">
              <Button className="font-normal">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>
    </div>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a">
>(({ className, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <span className="leading-none">{title}</span>
          <p className="line-clamp-2 leading-snug text-muted-foreground text-xs">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
