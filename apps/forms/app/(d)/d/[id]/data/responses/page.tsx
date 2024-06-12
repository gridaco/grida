import {
  ResponseFeedProvider,
  ResponseSessionFeedProvider,
} from "@/scaffolds/editor/feed";
import { GridEditor } from "@/scaffolds/grid-editor";

export default function FormResponsesPage() {
  return (
    <>
      <ResponseFeedProvider>
        <ResponseSessionFeedProvider>
          <GridEditor />
        </ResponseSessionFeedProvider>
      </ResponseFeedProvider>
    </>
  );
}
