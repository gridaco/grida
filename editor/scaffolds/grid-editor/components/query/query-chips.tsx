import { DataQueryOrderbyChip } from "./orderby";
import { DataQueryPrediateAddMenu, DataQueryPredicateChip } from "./predicate";
import { Button } from "@/components/ui-editor/button";
import { PlusIcon } from "@radix-ui/react-icons";
import { Separator } from "@/components/ui/separator";
import {
  IDataQueryOrderbyConsumer,
  IDataQueryPredicatesConsumer,
} from "@/scaffolds/data-query";

export function TableQueryChips(
  props: IDataQueryOrderbyConsumer & IDataQueryPredicatesConsumer
) {
  const { predicates, isOrderbySet } = props;

  return (
    <div className="flex gap-2">
      {isOrderbySet && (
        <>
          <DataQueryOrderbyChip {...props} />
          <Separator orientation="vertical" />
        </>
      )}
      {predicates.map((predicate, i) => (
        <DataQueryPredicateChip key={i} index={i} {...props} />
      ))}
      <DataQueryPrediateAddMenu {...props}>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <PlusIcon className="size-3 me-2" />
          Add filter
        </Button>
      </DataQueryPrediateAddMenu>
    </div>
  );
}
