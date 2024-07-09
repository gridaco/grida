import BlocksEditor from "@/scaffolds/blocks-editor";
import { Siebar } from "@/scaffolds/sidebar/sidebar";
import { SideControl } from "@/scaffolds/sidecontrol";

export default async function EditFormPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <aside className="hidden lg:flex h-full">
        <Siebar mode="blocks" />
      </aside>
      <div className="overflow-y-auto w-full">
        <div className="py-4 px-8 md:py-10 md:px-16">
          <BlocksEditor />
          <div
            style={{
              height: 100,
            }}
          />
        </div>
      </div>
      <aside className="hidden lg:flex h-full">
        <SideControl mode="blocks" />
      </aside>
    </main>
  );
}
