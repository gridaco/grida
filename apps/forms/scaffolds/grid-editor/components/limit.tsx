import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorState } from "@/scaffolds/editor";

export function GridLimit() {
  const [state, dispatch] = useEditorState();

  return (
    <div>
      <Select
        value={state.datagrid_rows_per_page + ""}
        onValueChange={(value) => {
          dispatch({
            type: "editor/data-grid/rows-per-page",
            limit: parseInt(value),
          });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="rows" />
        </SelectTrigger>
        <SelectContent>
          <></>
          <SelectItem value={10 + ""}>10 rows</SelectItem>
          <SelectItem value={100 + ""}>100 rows</SelectItem>
          <SelectItem value={500 + ""}>500 rows</SelectItem>
          <SelectItem value={1000 + ""}>1000 rows</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
