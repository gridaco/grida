import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useCurrentEditor } from "@/grida-canvas-react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  OpenInNewWindowIcon,
  GearIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
} from "@radix-ui/react-icons";
import Link from "next/link";
import { KeyboardShortcuts } from "./uxhost-settings-keyboardshortcuts";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { KeyboardIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const menuItems = [
  {
    name: "General",
    value: "general",
    icon: GearIcon,
  },
  {
    name: "Keyboard Shortcuts",
    value: "keybindings",
    icon: KeyboardIcon,
  },
];

export function SettingsDialog({
  initialPage = "keybindings",
  ...props
}: React.ComponentProps<typeof Dialog> & {
  initialPage?: "keybindings" | "general";
}) {
  const editor = useCurrentEditor();
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<"keybindings" | "general">(
    initialPage
  );

  return (
    <Dialog {...props}>
      <DialogContent className="!max-w-4xl p-0 gap-0 flex flex-col h-[600px]">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <SidebarProvider className="flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-1 border-t overflow-hidden">
            <Sidebar collapsible="none" className="w-48 border-r shrink-0">
              <SidebarContent>
                <SidebarGroup>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {menuItems.map((item) => (
                        <SidebarMenuItem key={item.value}>
                          <SidebarMenuButton
                            isActive={activeTab === item.value}
                            onClick={() =>
                              setActiveTab(
                                item.value as "keybindings" | "general"
                              )
                            }
                          >
                            <item.icon className="size-4" />
                            <span>{item.name}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </SidebarContent>
            </Sidebar>
            <main className="flex-1 overflow-y-auto min-w-0 h-full">
              {activeTab === "general" && (
                <div className="px-6 py-6">
                  <FieldGroup>
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldLabel>Appearance</FieldLabel>
                        <FieldDescription>
                          Customize how Grida looks on your device.
                        </FieldDescription>
                      </FieldContent>
                      <Select
                        value={theme}
                        onValueChange={(value) => setTheme(value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="light">
                            <div className="flex items-center gap-2">
                              <SunIcon className="size-4" />
                              <span>Light</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="dark">
                            <div className="flex items-center gap-2">
                              <MoonIcon className="size-4" />
                              <span>Dark</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="system">
                            <div className="flex items-center gap-2">
                              <DesktopIcon className="size-4" />
                              <span>System</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <FieldSeparator />
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor="debug-mode">Debug Mode</FieldLabel>
                        <FieldDescription>
                          Enable debug mode for development and troubleshooting.
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="debug-mode"
                        checked={editor.debug}
                        onCheckedChange={(v) => {
                          editor.debug = v;
                        }}
                      />
                    </Field>
                    <FieldSeparator />
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldLabel>Rendering Backend</FieldLabel>
                        <FieldDescription>
                          Choose the rendering backend for the canvas.
                        </FieldDescription>
                      </FieldContent>
                      <div className="flex gap-2">
                        <Link href="/canvas/experimental/dom" target="_blank">
                          <Button size="sm" variant="outline">
                            DOM
                            <OpenInNewWindowIcon />
                          </Button>
                        </Link>
                        <Link href="/canvas" target="_blank">
                          <Button size="sm" variant="outline">
                            CANVAS WASM
                            <OpenInNewWindowIcon />
                          </Button>
                        </Link>
                      </div>
                    </Field>
                  </FieldGroup>
                </div>
              )}
              {activeTab === "keybindings" && (
                <div className="h-full flex flex-col">
                  <KeyboardShortcuts />
                </div>
              )}
            </main>
          </div>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
