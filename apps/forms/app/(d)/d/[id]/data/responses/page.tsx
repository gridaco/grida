import {
  ResponseFeedProvider,
  ResponseSessionFeedProvider,
  ResponseSyncProvider,
} from "@/scaffolds/editor/feed";
import { GridEditor } from "@/scaffolds/grid-editor";

export default function FormResponsesPage() {
  return (
    <>
      <ResponseFeedProvider>
        <ResponseSyncProvider>
          <ResponseSessionFeedProvider>
            <GridEditor />
          </ResponseSessionFeedProvider>
        </ResponseSyncProvider>
      </ResponseFeedProvider>
    </>
  );
}
