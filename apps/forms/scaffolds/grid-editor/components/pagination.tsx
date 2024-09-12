import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { useEditorState } from "@/scaffolds/editor";
import { ArrowLeftIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import { useCallback } from "react";

function useDatagridPagination() {
  //
  const [state, dispatch] = useEditorState();
  const {
    datagrid_page_index,
    datagrid_page_limit,
    datagrid_query_estimated_count,
  } = state;

  const min = 0;
  const max = Math.ceil(
    (datagrid_query_estimated_count ?? 0) / datagrid_page_limit
  );

  const hasprev = datagrid_page_index > min;
  const hasnext = datagrid_page_index < max;

  const paginate = useCallback(
    (index: number) => {
      dispatch({ type: "editor/data-grid/page", index });
    },
    [dispatch]
  );

  const prev = useCallback(() => {
    paginate(datagrid_page_index - 1);
  }, [datagrid_page_index, paginate]);

  const next = useCallback(() => {
    paginate(datagrid_page_index + 1);
  }, [datagrid_page_index, dispatch]);

  return {
    page: datagrid_page_index,
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
          max={max + 1}
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
