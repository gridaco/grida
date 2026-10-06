"use client";

import React from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@app/ui/components/navigation-menu";
import { GridaLogo } from "@/components/grida-logo";
import { GitHubLogoIcon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "@app/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerTrigger,
} from "@app/ui/components/drawer";
import { sitemap } from "./data/sitemap";
import { cn } from "@app/ui/lib/utils";
import {
  ResourceTypeIcon,
  ResourceTypeIconName,
} from "@/components/resource-type-icon";
import Link from "next/link";
import HeaderCTA from "./header-cta";

type Item = {
  icon?: ResourceTypeIconName;
  title: string;
  href: string;
  description?: string;
};

const features: Item[] = [
  sitemap.items.canvas,
  sitemap.items.fx,
  sitemap.items.ai_gateway,
  sitemap.items.slides,
  sitemap.items.svg,
  sitemap.items.forms,
  sitemap.items.database,
  // sitemap.items.west,
];

const resources: Item[] = [
  sitemap.items.library,
  sitemap.items.fonts,
  sitemap.items.icons,
  sitemap.items.tools,
  sitemap.items.brand,
  sitemap.items.docs,
  sitemap.items.thebundle,
  sitemap.items.joinslack,
  sitemap.items.contact,
];

export default function Header({ className }: { className?: string }) {
  return (
    <div className={cn("absolute top-0 left-0 right-0 z-50", className)}>
      <header className="container mx-auto py-4 px-4 xl:py-8">
        {/* desktop */}
        <div className="hidden lg:grid grid-cols-[1fr_auto_1fr] items-center gap-8">
          <Link
            href="/home"
            aria-label="Grida home"
            className="flex items-center justify-center justify-self-start"
          >
            <GridaLogo className="size-5" />
          </Link>
          <NavigationMenu className="[&_[data-slot=navigation-menu-viewport]]:rounded-2xl">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="rounded-full bg-transparent font-normal [&>svg]:hidden">
                  Features
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="flex flex-col w-[320px] p-3">
                    {features.map((component) => (
                      <ListItem
                        key={component.title}
                        icon={
                          component.icon ? (
                            <ResourceTypeIcon
                              type={component.icon}
                              className="size-4"
                            />
                          ) : undefined
                        }
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
                <NavigationMenuTrigger className="rounded-full bg-transparent font-normal [&>svg]:hidden">
                  Resources
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="flex flex-col w-[320px] p-3">
                    {resources.map((component) => (
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
                <NavigationMenuLink
                  asChild
                  className={cn(
                    navigationMenuTriggerStyle(),
                    "rounded-full bg-transparent font-normal"
                  )}
                >
                  <Link href={sitemap.links.pricing}>
                    <p className="font-normal">Pricing</p>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  asChild
                  className={cn(
                    navigationMenuTriggerStyle(),
                    "rounded-full bg-transparent font-normal"
                  )}
                >
                  <Link href={sitemap.items.downloads.href}>
                    <p className="font-normal">Download</p>
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex items-center gap-2 justify-self-end">
            <Link
              href={sitemap.links.github_grida}
              target="_blank"
              aria-label="GitHub"
            >
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full font-normal"
              >
                <GitHubLogoIcon className="text-foreground size-5" />
              </Button>
            </Link>
            <HeaderCTA />
          </div>
        </div>
        {/* mobile */}
        <div className="lg:hidden flex justify-between items-center">
          <Link
            href="/home"
            aria-label="Grida home"
            className="flex items-center justify-center"
          >
            <GridaLogo className="size-5" />
          </Link>
          <Drawer>
            <DrawerTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full font-normal"
                aria-label="Open navigation menu"
              >
                <HamburgerMenuIcon />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="h-[80dvh] overflow-hidden">
              <DrawerTitle className="sr-only font-normal">
                Navigation menu
              </DrawerTitle>
              {/* Keep links scrollable inside the bounded drawer (see test/www-navigation-mobile-drawer-scroll.md). */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-8">
                <section className="grid gap-2">
                  <Link href="/home">Home</Link>
                  <Link href={sitemap.links.pricing}>Pricing</Link>
                  <Link href={sitemap.items.downloads.href}>Download</Link>
                  <Link href={sitemap.links.github} target="_blank">
                    GitHub
                  </Link>
                </section>
                <section className="grid gap-2">
                  <span>
                    <span className="font-normal">Features</span>
                  </span>
                  <div className="grid gap-2">
                    {features.map((component, i) => (
                      <Link key={i} href={component.href}>
                        <span className="text-muted-foreground">
                          {component.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
                <section className="grid gap-2">
                  <span>
                    <span className="font-normal">Resources</span>
                  </span>
                  <div className="grid gap-2">
                    {resources.map((component, i) => (
                      <Link key={i} href={component.href}>
                        <span className="text-muted-foreground">
                          {component.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>
              <div className="w-full shrink-0 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t flex flex-col gap-2">
                <Link href={sitemap.links.signin} className="w-full">
                  <Button
                    variant="outline"
                    className="w-full rounded-full font-normal"
                  >
                    Log in
                  </Button>
                </Link>
                {/* Temporarily hidden during the marketing site renewal. */}
                <Link href={sitemap.links.cta} className="hidden w-full">
                  <Button className="rounded-full font-normal w-full">
                    Get Started
                  </Button>
                </Link>
              </div>
            </DrawerContent>
          </Drawer>
        </div>
      </header>
    </div>
  );
}

const ListItem = React.forwardRef<
  React.ElementRef<"a">,
  React.ComponentPropsWithoutRef<"a"> & {
    icon?: React.ReactNode;
  }
>(({ className, icon, title, children, ...props }, ref) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          ref={ref}
          className={cn(
            "block select-none font-normal space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            className
          )}
          {...props}
        >
          <div className="flex items-center gap-2">
            {icon && <div className="inline">{icon}</div>}
            <span className="text-sm font-medium leading-none">{title}</span>
          </div>
          <p className="line-clamp-2 leading-snug text-muted-foreground text-xs">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
