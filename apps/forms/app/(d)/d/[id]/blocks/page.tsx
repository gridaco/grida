"use client";

import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import { Siebar } from "@/scaffolds/sidebar/sidebar";
import { SideControl } from "@/scaffolds/sidecontrol";
import BlocksEditor from "@/scaffolds/blocks-editor";
import FormCollectionPage from "@/theme/templates/formcollection/page";

export default function EditFormPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <aside className="hidden lg:flex h-full">
        <Siebar mode="blocks" />
      </aside>
      <div className="w-full overflow-y-auto">
        <AgentThemeProvider>
          <CurrentPageCanvas />
        </AgentThemeProvider>
      </div>
      <aside className="hidden lg:flex h-full">
        <SideControl mode="blocks" />
      </aside>
    </main>
  );
}

function CurrentPageCanvas() {
  const [state, dispatch] = useEditorState();

  switch (state.document.selected_page_id) {
    case "form":
      return <BlocksEditor />;
    case "collection":
      return (
        <div className="mx-auto my-20 max-w-screen-sm border rounded-2xl shadow-2xl bg-background overflow-hidden">
          <FormCollectionPage />
        </div>
      );
    default:
      return <>TODO</>;
  }
}
