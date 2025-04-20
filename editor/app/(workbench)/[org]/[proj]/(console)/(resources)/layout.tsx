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
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { ArrowLeftIcon } from "@radix-ui/react-icons";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import Link from "next/link";
import { previewlink } from "@/lib/internal/url";

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
                      Console
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
                          <ResourceTypeIcon type="tag" className="size-4" />
                          Tags
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
                          <ResourceTypeIcon type="v0_site" className="size-4" />
                          Site Settings
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Link>
                    <Link href={`/${org}/${proj}/analytics`}>
                      <SidebarMenuItem>
                        <SidebarMenuButton size="sm">
                          <ResourceTypeIcon type="chart" className="size-4" />
                          Analytics
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Link>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Events</SidebarGroupLabel>
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
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
              <SidebarGroup>
                <SidebarGroupLabel>Advanced</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <Link href={`/${org}/${proj}/integrations`}>
                      <SidebarMenuItem>
                        <SidebarMenuButton size="sm">
                          <ResourceTypeIcon type="connect" className="size-4" />
                          Connections
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Link>
                  </SidebarMenu>
                  <SidebarMenu>
                    <Link href={previewlink({ org, proj, path: "/p/login" })}>
                      <SidebarMenuItem>
                        <SidebarMenuButton size="sm">
                          <ResourceTypeIcon
                            type="customer-portal"
                            className="size-4"
                          />
                          Customer Portal
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </Link>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <div className="flex flex-col overflow-hidden w-full h-full">
            <div className="w-full h-full overflow-x-hidden overflow-y-auto">
              {children}
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
