import { useEditorState } from "@/scaffolds/editor";
import { txt_n_plural } from "@/utils/plural";

export function GridCount({ count }: { count: number }) {
  const [state] = useEditorState();
  const { datagrid_table_row_keyword } = state;

  return (
    <span className="text-sm font-medium">
      {txt_n_plural(count, datagrid_table_row_keyword)}
    </span>
  );
}
