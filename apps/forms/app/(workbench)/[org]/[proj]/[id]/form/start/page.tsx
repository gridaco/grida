import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { SideControl } from "@/scaffolds/sidecontrol";
import FormStartPage from "@/theme/templates/formstart/default/page";

import dummy from "@/theme/templates/formstart/data/01.dummy.json";

export default function FormStartEditPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <div className="w-full px-10 overflow-scroll">
        <div className="w-full mx-auto my-20 max-w-sm xl:max-w-4xl border rounded-2xl shadow-2xl bg-background">
          <AgentThemeProvider>
            {/* @ts-ignore FIXME:  */}
            <FormStartPage data={dummy} />
          </AgentThemeProvider>
        </div>
      </div>
      <aside className="hidden lg:flex h-full">
        <SideControl />
      </aside>
    </main>
  );
}
