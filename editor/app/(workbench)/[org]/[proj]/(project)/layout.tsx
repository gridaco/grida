import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarFooter,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { ProjectLoaded, ProjectTagsProvider } from "@/scaffolds/workspace";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { AboutGridaWestCard } from "./about-west-card";
import "../../../../editor.css";

const inter = Inter({ subsets: ["latin"] });

type Params = { org: string; proj: string };

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { org, proj } = await params;

  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="h-screen flex flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <SidebarProvider>
              <div className="flex flex-1 overflow-y-auto">
                <div className="h-full flex flex-1 w-full">
                  <Sidebar>
                    <SidebarHeader>
                      <SidebarMenu>
                        <Link href={`/${org}/${proj}`}>
                          <SidebarMenuItem>
                            <SidebarMenuButton>
                              <ArrowLeftIcon />
                              Project Console
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </Link>
                      </SidebarMenu>
                    </SidebarHeader>
                    <SidebarContent>
                      <SidebarGroup>
                        <SidebarGroupLabel>Customer</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <Link href={`/${org}/${proj}/customers`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="customer"
                                    className="size-4"
                                  />
                                  Customers
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                            <Link href={`/${org}/${proj}/tags`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="tag"
                                    className="size-4"
                                  />
                                  Tags
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Marketing</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <Link href={`/${org}/${proj}/campaigns`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="campaign"
                                    className="size-4"
                                  />
                                  Campaigns
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                            <Link href={`/${org}/${proj}/analytics`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="chart"
                                    className="size-4"
                                  />
                                  Analytics
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Site</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <Link href={`/${org}/${proj}/www`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="v0_site"
                                    className="size-4"
                                  />
                                  Site Settings
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                      <SidebarGroup>
                        <SidebarGroupLabel>Advanced</SidebarGroupLabel>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <Link href={`/${org}/${proj}/customers/policies`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="auth"
                                    className="size-4"
                                  />
                                  Customer Auth
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                            <Link href={`/${org}/${proj}/integrations`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  <ResourceTypeIcon
                                    type="connect"
                                    className="size-4"
                                  />
                                  Connections
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter>
                      <AboutGridaWestCard />
                    </SidebarFooter>
                  </Sidebar>
                  <div className="flex flex-col overflow-hidden w-full h-full">
                    <header className="px-2 h-11 min-h-11 flex items-center border-b bg-workbench-panel desktop-drag-area"></header>
                    <div className="w-full h-full overflow-x-hidden overflow-y-auto">
                      <ProjectLoaded>
                        <ProjectTagsProvider>{children}</ProjectTagsProvider>
                      </ProjectLoaded>
                    </div>
                  </div>
                </div>
              </div>
              <EditorHelpFab />
              <ToasterWithMax position="bottom-center" max={5} />
            </SidebarProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
