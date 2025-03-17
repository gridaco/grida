import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import "../../../../editor.css";
import { ProjectLoaded } from "@/scaffolds/workspace";

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
                              Back to Dashboard
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        </Link>
                      </SidebarMenu>
                    </SidebarHeader>
                    <SidebarContent>
                      <SidebarGroup>
                        <SidebarGroupContent>
                          <SidebarMenu>
                            <Link href={`/${org}/${proj}/customers`}>
                              <SidebarMenuItem>
                                <SidebarMenuButton size="sm">
                                  Customers
                                </SidebarMenuButton>
                              </SidebarMenuItem>
                            </Link>
                            {/* <Link href={`/${org}/${proj}/analytics`}> */}
                            <SidebarMenuItem>
                              <SidebarMenuButton size="sm" disabled>
                                Analytics
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            {/* </Link> */}
                            {/* <Link href={`/${org}/${proj}/token-chain`}> */}
                            <SidebarMenuItem>
                              <SidebarMenuButton size="sm" disabled>
                                Token Exchange
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                            {/* </Link> */}
                          </SidebarMenu>
                        </SidebarGroupContent>
                      </SidebarGroup>
                    </SidebarContent>
                  </Sidebar>
                  <div className="flex flex-col overflow-hidden w-full h-full">
                    <header className="px-2 h-11 min-h-11 flex items-center border-b bg-workbench-panel desktop-drag-area"></header>
                    <div className="w-full h-full overflow-x-hidden">
                      <ProjectLoaded>{children}</ProjectLoaded>
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
