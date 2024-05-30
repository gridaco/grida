import {
  FormResponsesProvider,
  InitialResponsesProvider,
} from "@/scaffolds/editor";
import { GridEditor } from "@/scaffolds/grid-editor";

export default function FormResponsesPage() {
  return (
    <>
      <InitialResponsesProvider>
        <FormResponsesProvider>
          <GridEditor />
        </FormResponsesProvider>
      </InitialResponsesProvider>
    </>
  );
}
