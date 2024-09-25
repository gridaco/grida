import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { useEditorState } from "@/scaffolds/editor";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import assert from "assert";
import { useCallback } from "react";

function useDatagridPagination() {
  const [state, dispatch] = useEditorState();
  const { datagrid_query, datagrid_query_estimated_count } = state;

  assert(datagrid_query);
  const { q_page_index, q_page_limit } = datagrid_query;

  const min = 0;
  const max =
    Math.ceil((datagrid_query_estimated_count ?? 0) / q_page_limit) - 1;

  const hasprev = q_page_index > min;
  const hasnext = q_page_index < max;

  const paginate = useCallback(
    (index: number) => {
      dispatch({ type: "editor/data-grid/query/page", index });
    },
    [dispatch]
  );

  const prev = useCallback(() => {
    paginate(q_page_index - 1);
  }, [q_page_index, paginate]);

  const next = useCallback(() => {
    paginate(q_page_index + 1);
  }, [q_page_index, paginate]);

  return {
    page: q_page_index,
    min,
    max,
    hasprev,
    hasnext,
    paginate,
    prev,
    next,
  };
}

export function GridPagination() {
  const { min, max, hasprev, hasnext, page, paginate, prev, next } =
    useDatagridPagination();

  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={!hasprev}
        variant="outline"
        className={WorkbenchUI.buttonVariants({
          variant: "outline",
          size: "icon",
        })}
        onClick={prev}
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" />
      </Button>
      <div className="flex flex-1 items-center gap-1 text-xs">
        <p className="text-muted-foreground">Page</p>
        <Input
          type="number"
          min={min + 1}
          max={max}
          value={page + 1}
          onChange={(e) => {
            const i = parseInt(e.target.value) - 1;
            if (i >= min && i <= max) {
              paginate(i);
            }
          }}
          className={WorkbenchUI.inputVariants()}
        />
        <p className="text-muted-foreground whitespace-nowrap">of {max + 1}</p>
      </div>
      <Button
        disabled={!hasnext}
        variant="outline"
        className={WorkbenchUI.buttonVariants({
          variant: "outline",
          size: "icon",
        })}
        onClick={next}
      >
        <ArrowRightIcon className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
