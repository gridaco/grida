import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { Inter } from "next/font/google";
import { ProjectLoaded, ProjectTagsProvider } from "@/scaffolds/workspace";
import { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";

const inter = Inter({ subsets: ["latin"] });

type Params = { org: string; proj: string };

export const metadata: Metadata = {
  title: "Project Console",
};

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="h-screen flex flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              <div className="flex flex-1 overflow-y-auto">
                <div className="h-full flex flex-1 w-full">
                  <div className="flex flex-col overflow-hidden w-full h-full">
                    <div className="w-full h-full overflow-x-hidden overflow-y-auto">
                      <ProjectLoaded>
                        <ProjectTagsProvider>{children}</ProjectTagsProvider>
                      </ProjectLoaded>
                    </div>
                  </div>
                </div>
              </div>
              <EditorHelpFab />
              <Toaster position="bottom-center" />
            </TooltipProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}
