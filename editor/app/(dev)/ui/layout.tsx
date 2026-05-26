import type { Metadata } from "next";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UISidebar } from "./_sidebar";

export const metadata: Metadata = {
  title: "UI Components | Grida",
  description:
    "Explore Grida's collection of UI components with interactive demos.",
};

export default function UILayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <UISidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
