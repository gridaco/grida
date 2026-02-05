import { SidebarProvider } from "@/components/ui/sidebar";
import { ConsoleResourcesSidebar } from "./console-resources-sidebar";

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
          <ConsoleResourcesSidebar org={org} proj={proj} />
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
