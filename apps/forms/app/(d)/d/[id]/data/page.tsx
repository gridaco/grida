import {
  FormResponsesProvider,
  InitialResponsesProvider,
} from "@/scaffolds/editor";
import { GridEditor } from "@/scaffolds/grid-editor";

export default async function FormResponsesPage() {
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
