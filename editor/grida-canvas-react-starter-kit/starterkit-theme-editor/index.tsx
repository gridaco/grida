"use client";

import React, { useState } from "react";
import {
  AirplayIcon,
  BracesIcon,
  Paintbrush,
  PyramidIcon,
  TelescopeIcon,
  TypeIcon,
} from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SchemedColorToken, defaultThemeColors } from "@/theme/shadcn/colors";
import { ThemedMonacoEditor } from "@/components/monaco";
import { CardsDemo } from "@/theme/shadcn/example/cards";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import {
  SectionHeader,
  SectionHeaderDescription,
  SectionHeaderTitle,
} from "./components/section-header";
import colors, { ColorPalette } from "@/theme/tailwindcolors";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "next-themes";
import { ThemeEditorProvider, ThemeEditorState, useThemeEditor } from "./state";
import { ColorPickerChip } from "./components/color-chip";

const nav = [
  { value: "colors", name: "Colors", icon: Paintbrush },
  { value: "typography", name: "Typography", icon: TypeIcon },
  {
    value: "icons",
    name: "Icons",
    icon: PyramidIcon,
    disabled: true,
    badge: "soon",
  },
  { value: "advanced", name: "Advanced", icon: BracesIcon },
  { value: "preview", name: "Preview", icon: AirplayIcon },
  {
    value: "explore",
    name: "Explore",
    icon: TelescopeIcon,
    disabled: true,
    badge: "soon",
  },
];

export const constraints = {
  min: {
    width: 640,
    height: 320,
  },
  max: {
    width: 1440,
    height: 900,
  },
  default: {
    width: 800,
    height: 600,
  },
};

export function ThemeEditor({
  onChange,
}: {
  onChange?: (theme: ThemeEditorState) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isdark = resolvedTheme ? resolvedTheme === "dark" : false;
  const colorscheme = isdark ? "dark" : "light";

  return (
    <ThemeEditorProvider
      onChange={onChange}
      colorscheme={colorscheme}
      initialState={{
        theme: {
          colors: defaultThemeColors as unknown as Record<
            string,
            SchemedColorToken
          >,
          palletes: colors,
        },
      }}
    >
      <Body />
    </ThemeEditorProvider>
  );
}

function Body() {
  const { setTheme } = useTheme();
  const { colorscheme } = useThemeEditor();
  const [tab, setTab] = useState("colors");

  return (
    <SidebarProvider className="items-start h-full min-h-0">
      <Sidebar collapsible="none" className="hidden md:flex">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      disabled={item.disabled}
                      isActive={item.value === tab}
                      onClick={() => setTab(item.value)}
                    >
                      <item.icon />
                      <span>{item.name}</span>
                      {item.badge && (
                        <Badge variant="outline">{item.badge}</Badge>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <main className="flex flex-1 flex-col overflow-hidden max-h-full h-full bg-background">
        <header className="flex h-16 px-4 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex-1 flex items-center gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Theme</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="capitalize">{tab}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex-1 flex justify-end">
            <ToggleGroup
              type="single"
              value={colorscheme}
              onValueChange={(v) => v && setTheme(v)}
              className="w-min"
            >
              <ToggleGroupItem value="light" title="Light">
                <SunIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value="dark" title="Dark">
                <MoonIcon />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </header>
        <Tabs
          value={tab}
          className="px-4 pb-10 flex-1 max-h-full overflow-y-auto overflow-x-hidden"
        >
          <TabsContent value={"colors"}>
            <Colors />
          </TabsContent>
          <TabsContent value={"typography"}>
            <Typography />
          </TabsContent>
          <TabsContent value={"icons"}>
            <Icons />
          </TabsContent>
          <TabsContent value={"advanced"}>
            <Advanced />
          </TabsContent>
          <TabsContent value={"preview"}>
            <Preview />
          </TabsContent>
        </Tabs>
      </main>
    </SidebarProvider>
  );
}

function Colors() {
  const { colorscheme, theme, updateSchemeColor } = useThemeEditor();
  return (
    <div className="grid gap-20">
      <section>
        <SectionHeader>
          <SectionHeaderTitle>Variable Colors</SectionHeaderTitle>
          <SectionHeaderDescription>
            Customize your theme colors
          </SectionHeaderDescription>
        </SectionHeader>
        <div>
          <div className="divide-y space-y-2">
            {Object.entries(theme.colors).map(
              ([key, { description, ...schemes }]: [
                string,
                SchemedColorToken,
              ]) => {
                return (
                  <div key={key} className="flex items-center gap-2 py-4">
                    <div className="flex-1">
                      <p className="text-sm font-mono">{key}</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        {description}
                      </p>
                    </div>
                    <div className="flex-1 flex flex-wrap justify-end gap-2">
                      <ColorPickerChip
                        value={schemes[colorscheme]}
                        onValueChange={(value) =>
                          updateSchemeColor(colorscheme, key, value)
                        }
                      />
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>
      <section>
        <SectionHeader>
          <SectionHeaderTitle>Static Colors</SectionHeaderTitle>
          <SectionHeaderDescription>
            Static Colors (read-only, tailwind v3 colors)
          </SectionHeaderDescription>
        </SectionHeader>
        <div>
          <div className="divide-y space-y-2">
            {Object.entries(theme.palletes).map(
              ([key, palette]: [string, ColorPalette]) => {
                return (
                  <div key={key} className="flex items-center gap-2 py-4">
                    <div className="flex-1">
                      <p className="text-sm font-mono">{key}</p>
                      <p className="text-muted-foreground text-xs mt-1">
                        {palette[500]}
                      </p>
                    </div>
                    <div className="flex-1 flex flex-wrap justify-end gap-2">
                      {(
                        [
                          50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950,
                        ] as const
                      ).map((level) => (
                        <ColorPickerChip
                          key={level}
                          value={palette[level]}
                          className="size-8"
                          disabled
                        />
                      ))}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Typography() {
  const text = "The quick brown fox ...";
  return (
    <div className="grid gap-20">
      <section>
        <SectionHeader>
          <SectionHeaderTitle>Font Family</SectionHeaderTitle>
          <SectionHeaderDescription>
            Customize your theme typography
          </SectionHeaderDescription>
        </SectionHeader>
      </section>

      <section className="grid gap-2">
        <SectionHeader>
          <SectionHeaderTitle>Font Size</SectionHeaderTitle>
          <SectionHeaderDescription>
            Customize your theme typography
          </SectionHeaderDescription>
        </SectionHeader>
        <FontSizeItem title="text-xs">
          <span className="text-xs">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-sm">
          <span className="text-sm">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-base">
          <span className="text-base">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-lg">
          <span className="text-lg">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-xl">
          <span className="text-xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-2xl">
          <span className="text-2xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-3xl">
          <span className="text-3xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-4xl">
          <span className="text-4xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-5xl">
          <span className="text-5xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-6xl">
          <span className="text-6xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-7xl">
          <span className="text-7xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-8xl">
          <span className="text-8xl">{text}</span>
        </FontSizeItem>
        <FontSizeItem title="text-9xl">
          <span className="text-9xl">{text}</span>
        </FontSizeItem>
      </section>

      <section>
        <SectionHeader>
          <SectionHeaderTitle>Rich Text</SectionHeaderTitle>
          <SectionHeaderDescription>
            Customize your theme typography
          </SectionHeaderDescription>
        </SectionHeader>
        <div className="max-w-md border border-dashed rounded-xs p-4">
          <article className="prose dark:prose-invert">
            <h1>Prose Preview</h1>
            <p>This paragraph demonstrates TailwindCSS prose styling.</p>

            <h2>Blockquote</h2>
            <blockquote>
              <p>This is a blockquote. It provides emphasis to quoted text.</p>
            </blockquote>

            <h2>Code Block</h2>
            <pre>
              <code>console.log(&quot;Hello, world!&quot;);</code>
            </pre>

            <h2>Table</h2>
            <table>
              <thead>
                <tr>
                  <th>Header 1</th>
                  <th>Header 2</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Row 1, Cell 1</td>
                  <td>Row 1, Cell 2</td>
                </tr>
                <tr>
                  <td>Row 2, Cell 1</td>
                  <td>Row 2, Cell 2</td>
                </tr>
              </tbody>
            </table>

            <h2>List</h2>
            <ul>
              <li>List item one</li>
              <li>List item two</li>
              <li>List item three</li>
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}

function FontSizeItem({
  title,
  children = "The quick brown fox ...",
  ...props
}: React.HtmlHTMLAttributes<HTMLParagraphElement>) {
  return (
    <div>
      <span className="font-mono text-xs text-muted-foreground">{title}</span>
      <p {...props}>{children}</p>
    </div>
  );
}

function Icons() {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Checkbox />
        <span>Radix Icons</span>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox />
        <span>Lucid Icons</span>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox />
        <span>Material Icons</span>
      </div>
    </div>
  );
}

function Advanced() {
  return (
    <div className="w-full h-full">
      <SectionHeader>
        <SectionHeaderTitle>Custom CSS</SectionHeaderTitle>
        <SectionHeaderDescription>
          Customize your theme with custom CSS
        </SectionHeaderDescription>
      </SectionHeader>
      <ThemedMonacoEditor width="100%" height="100%" language="css" />
    </div>
  );
}

function Preview() {
  return <CardsDemo />;
}
