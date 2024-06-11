import {
  ResponseFeedProvider,
  InitialResponsesProvider,
  ResponseSessionFeedProvider,
} from "@/scaffolds/editor";
import { GridEditor } from "@/scaffolds/grid-editor";

export default function FormResponsesPage() {
  return (
    <>
      <InitialResponsesProvider>
        <ResponseFeedProvider>
          <ResponseSessionFeedProvider>
            <GridEditor />
          </ResponseSessionFeedProvider>
        </ResponseFeedProvider>
      </InitialResponsesProvider>
    </>
  );
}
