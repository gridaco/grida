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
import { GitHubLogoIcon, HamburgerMenuIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import Link from "next/link";
import { sitemap } from "./data/sitemap";

type Item = {
  title: string;
  href: string;
  description?: string;
};

const features: Item[] = [
  sitemap.items.canvas,
  sitemap.items.forms,
  sitemap.items.database,
  sitemap.items.figmaci,
];

const resources: Item[] = [
  sitemap.items.docs,
  sitemap.items.joinslack,
  sitemap.items.thebundle,
];

export default function Header() {
  return (
    <div className="absolute top-0 left-0 right-0 z-50">
      <header className="py-4 px-4 lg:py-8 lg:px-24">
        {/* desktop */}
        <div className="hidden md:flex container mx-auto justify-between items-center">
          <Link href="/" className="flex items-center justify-center gap-2">
            <GridaLogo className="w-5 h-5" />
            <span className="text-lg font-bold">Grida</span>
          </Link>
          <div className="flex gap-4 lg:gap-12 items-center">
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger className=" bg-transparent font-normal">
                    Features
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="flex flex-col w-[300px] p-3">
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
                  <NavigationMenuTrigger className="bg-transparent font-normal">
                    Resources
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="flex flex-col w-[150px] p-3">
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
                  <Link href={sitemap.links.pricing} legacyBehavior passHref>
                    <NavigationMenuLink
                      className={`${navigationMenuTriggerStyle()} bg-transparent`}
                    >
                      <p className="font-normal">Pricing </p>
                    </NavigationMenuLink>
                  </Link>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <Link href={sitemap.links.github} target="_blank">
                    <Button variant="ghost" size="icon">
                      <GitHubLogoIcon className="text-foreground w-5 h-5" />
                    </Button>
                  </Link>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
            <div className="flex gap-2">
              <Link href={sitemap.links.signin} className="hidden md:block">
                <Button variant="ghost">Sign in</Button>
              </Link>
              <Link href={sitemap.links.cta}>
                <Button className="font-normal">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
        {/* mobile */}
        <div className="md:hidden flex justify-between items-center">
          <Link href="/" className="flex items-center justify-center gap-2">
            <GridaLogo className="w-5 h-5" />
            <span className="text-lg font-bold">Grida</span>
          </Link>
          <Drawer>
            <DrawerTrigger asChild>
              <Button size="icon" variant="ghost">
                <HamburgerMenuIcon />
              </Button>
            </DrawerTrigger>
            <DrawerContent className="min-h-96 flex flex-col justify-between">
              <div className="w-full px-4 space-y-8 mb-10">
                <section className="grid gap-2">
                  <Link href="/">Home</Link>
                  <Link href={sitemap.links.pricing}>Pricing</Link>
                  <Link href={sitemap.links.github} target="_blank">
                    GitHub
                  </Link>
                </section>
                <section className="grid gap-2">
                  <span>
                    <span className="font-semibold">Features</span>
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
                    <span className="font-semibold">Resources</span>
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
              <div className="w-full px-4 py-4 border-t flex flex-col gap-2">
                <Link href={sitemap.links.signin} className="w-full">
                  <Button variant="outline" className="w-full">
                    Sign in
                  </Button>
                </Link>
                <Link href={sitemap.links.cta} className="w-full">
                  <Button className="font-normal w-full">Get Started</Button>
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
          <span className="text-sm font-medium leading-none">{title}</span>
          <p className="line-clamp-2 leading-snug text-muted-foreground text-xs">
            {children}
          </p>
        </a>
      </NavigationMenuLink>
    </li>
  );
});
ListItem.displayName = "ListItem";
