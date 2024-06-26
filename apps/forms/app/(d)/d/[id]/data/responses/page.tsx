import {
  ResponseFeedProvider,
  ResponseSessionFeedProvider,
  ResponseSyncProvider,
  XSupabaseMainTableFeedProvider,
  XSupabaseMainTableSyncProvider,
} from "@/scaffolds/editor/feed";
import { GridEditor } from "@/scaffolds/grid-editor";
import { Siebar } from "@/scaffolds/sidebar/sidebar";

export default function FormResponsesPage() {
  return (
    <>
      <ResponseFeedProvider />
      <ResponseSyncProvider />
      <ResponseSessionFeedProvider />
      <XSupabaseMainTableFeedProvider />
      <XSupabaseMainTableSyncProvider />
      <div className="h-full flex flex-1 w-full">
        {/* side */}
        <aside className="hidden lg:flex h-full">
          <Siebar />
        </aside>
        <div className="w-full h-full overflow-x-hidden">
          <GridEditor />
        </div>
      </div>
    </>
  );
}
