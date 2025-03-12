import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { Inter } from "next/font/google";
import "../../../../editor.css";

const inter = Inter({ subsets: ["latin"] });

type Params = { org: string };

export default function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
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
                  <div className="flex flex-col overflow-hidden w-full h-full">
                    <header className="px-2 h-11 min-h-11 flex items-center border-b bg-workbench-panel desktop-drag-area"></header>
                    <div className="w-full h-full overflow-x-hidden">
                      {children}
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
